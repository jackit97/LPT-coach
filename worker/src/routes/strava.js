import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate } from '../auth.js';
import { assertAccessToAthlete, resolveTargetUserId } from '../utils.js';

const app = new Hono();
app.use('*', authenticate());

async function getValidAccessToken(sql, userId, integrationData, env) {
  let { access_token, refresh_token, expires_at, client_id, client_secret } = integrationData;
  const now = Math.floor(Date.now() / 1000);

  if (expires_at && expires_at < now + 120 && refresh_token) {
    const clientId = client_id || env.STRAVA_CLIENT_ID;
    const clientSecret = client_secret || env.STRAVA_CLIENT_SECRET;

    if (clientId && clientSecret) {
      const res = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token,
        }),
      });

      if (res.ok) {
        const refreshed = await res.json();
        access_token = refreshed.access_token;
        refresh_token = refreshed.refresh_token;
        expires_at = refreshed.expires_at;

        const updatedData = {
          ...integrationData,
          access_token,
          refresh_token,
          expires_at,
        };

        await sql`
          UPDATE endurance_integrations
          SET data_json = ${JSON.stringify(updatedData)}, updated_at = NOW()
          WHERE user_id = ${userId} AND provider = 'strava'
        `;
        return { accessToken: access_token, integrationData: updatedData };
      }
    }
  }

  return { accessToken: access_token, integrationData };
}

async function syncStravaActivities(sql, userId, accessToken, coachId, integrationData) {
  const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Errore Strava API: ${res.status} ${errorText}`);
  }

  const activities = await res.json();
  if (!Array.isArray(activities)) return { importedCount: 0, totalFetched: 0 };

  let importedCount = 0;

  for (const act of activities) {
    const externalId = String(act.id);
    const date = act.start_date_local ? act.start_date_local.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const distanceKm = act.distance ? Number((act.distance / 1000).toFixed(2)) : 0;
    const durationSeconds = Math.round(act.moving_time || act.elapsed_time || 0);
    const durationMinutes = Math.round(durationSeconds / 60);
    const avgHr = act.average_heartrate ? Math.round(act.average_heartrate) : null;
    const elevGainM = act.total_elevation_gain ? Math.round(act.total_elevation_gain) : null;
    const sport = act.sport_type || act.type || 'Attività';

    let sportEmoji = '🏅';
    if (/run/i.test(sport)) sportEmoji = '🏃';
    else if (/ride|bike|cycling/i.test(sport)) sportEmoji = '🚴';
    else if (/swim/i.test(sport)) sportEmoji = '🏊';
    else if (/walk|hike/i.test(sport)) sportEmoji = '🥾';
    else if (/weight|crossfit|gym/i.test(sport)) sportEmoji = '🏋️';

    let paceStr = '';
    if (/run|walk|hike/i.test(sport) && distanceKm > 0 && durationSeconds > 0) {
      const secPerKm = Math.round(durationSeconds / distanceKm);
      paceStr = `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')}/km`;
    }

    const fmtTime = (s) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
    };

    const details = [
      distanceKm > 0 ? `${distanceKm.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km` : null,
      durationSeconds > 0 ? fmtTime(durationSeconds) : null,
      paceStr ? paceStr : null,
      elevGainM ? `+${elevGainM}m disl.` : null,
      avgHr ? `FC ${avgHr} bpm` : null,
      act.calories ? `${Math.round(act.calories)} kcal` : null,
    ].filter(Boolean).join(' · ');

    const description = `${sportEmoji} ${act.name || sport}\n${details}\nImportato automaticamente da Strava`;
    const workoutType = /weight|crossfit|gym/i.test(sport) ? 'forza' : 'endurance';
    const sportKey = /run|walk|hike/i.test(sport) ? 'corsa' : /ride|bike|cycl/i.test(sport) ? 'ciclismo' : /swim/i.test(sport) ? 'nuoto' : null;

    // 1. Upsert into endurance_activities
    const existingAct = await sql`
      SELECT activity_id FROM endurance_activities
      WHERE user_id = ${userId} AND provider = 'strava' AND external_id = ${externalId}
      LIMIT 1
    `;

    if (existingAct.length) {
      await sql`
        UPDATE endurance_activities
        SET "date" = ${date}, duration_minutes = ${durationMinutes}, distance_km = ${distanceKm},
            avg_hr = ${avgHr}, raw_json = ${JSON.stringify(act)}
        WHERE activity_id = ${existingAct[0].activity_id}
      `;
    } else {
      await sql`
        INSERT INTO endurance_activities (user_id, provider, external_id, "date", duration_minutes, distance_km, avg_hr, raw_json)
        VALUES (${userId}, 'strava', ${externalId}, ${date}, ${durationMinutes}, ${distanceKm}, ${avgHr}, ${JSON.stringify(act)})
      `;
    }

    // 2. Upsert into calendar_workouts
    const existingWk = await sql`
      SELECT workout_id FROM calendar_workouts
      WHERE utenteid = ${userId} AND external_provider = 'strava' AND external_id = ${externalId}
      LIMIT 1
    `;

    let workoutId;
    if (existingWk.length) {
      workoutId = existingWk[0].workout_id;
      await sql`
        UPDATE calendar_workouts
        SET titolo = ${act.name || sport},
            descrizione = ${description},
            durata_minuti = ${durationMinutes},
            durata_secondi = ${durationSeconds},
            distance_km = ${distanceKm},
            avg_hr = ${avgHr},
            elev_gain_m = ${elevGainM},
            sport = ${sportKey},
            updated_at = NOW()
        WHERE workout_id = ${workoutId}
      `;
    } else {
      const inserted = await sql`
        INSERT INTO calendar_workouts
          (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, distance_km, avg_hr, elev_gain_m, sport, colore, stato, external_id, external_provider)
        VALUES
          (${userId}, ${coachId}, ${date}, ${workoutType}, ${act.name || sport}, ${description}, ${durationMinutes}, ${durationSeconds}, ${distanceKm}, ${avgHr}, ${elevGainM}, ${sportKey}, '#FC4C02', 'completato', ${externalId}, 'strava')
        RETURNING workout_id
      `;
      workoutId = inserted[0]?.workout_id;
      importedCount++;
    }

    // 3. Upsert into workout_feedback
    if (workoutId) {
      const rpe = act.suffer_score ? Math.min(10, Math.max(1, Math.round(act.suffer_score / 15))) : null;
      await sql`
        INSERT INTO workout_feedback (workout_id, utenteid, completato, rpe, durata_effettiva_minuti, note, updated_at)
        VALUES (${workoutId}, ${userId}, 1, ${rpe}, ${durationMinutes}, ${description}, NOW())
        ON CONFLICT (workout_id, utenteid) DO UPDATE SET
          completato = 1,
          durata_effettiva_minuti = EXCLUDED.durata_effettiva_minuti,
          note = EXCLUDED.note,
          updated_at = NOW()
      `;
    }
  }

  const updatedData = { ...integrationData, last_sync: new Date().toISOString() };
  await sql`
    UPDATE endurance_integrations
    SET data_json = ${JSON.stringify(updatedData)}, updated_at = NOW()
    WHERE user_id = ${userId} AND provider = 'strava'
  `;

  return { importedCount, totalFetched: activities.length };
}

// GET /strava/status?utenteId=123
app.get('/status', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);

  const allowed = await assertAccessToAthlete(sql, user, utenteId);
  if (!allowed) return c.json({ message: 'Accesso non consentito' }, 403);

  const defaultClientId = c.env.STRAVA_CLIENT_ID || '';

  const rows = await sql`
    SELECT connected, data_json, updated_at
    FROM endurance_integrations
    WHERE user_id = ${utenteId} AND provider = 'strava'
    LIMIT 1
  `;

  if (!rows.length || !rows[0].connected) {
    return c.json({
      connected: false,
      sync_mode: 'auto',
      hasServerApp: Boolean(defaultClientId),
      defaultClientId,
    });
  }

  let parsed = {};
  try { parsed = JSON.parse(rows[0].data_json || '{}'); } catch {}

  return c.json({
    connected: true,
    athlete: parsed.athlete || null,
    last_sync: parsed.last_sync || rows[0].updated_at,
    sync_mode: parsed.sync_mode || 'auto',
    clientId: parsed.client_id || defaultClientId,
    hasServerApp: Boolean(defaultClientId),
    defaultClientId,
  });
});

// POST /strava/connect
// Exchange OAuth code for tokens and save to endurance_integrations
app.post('/connect', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const body = await c.req.json().catch(() => ({}));
  const { code, clientId, clientSecret, redirectUri, syncMode } = body;

  if (!code) {
    return c.json({ message: 'Codice di autorizzazione Strava (code) mancante' }, 400);
  }

  const effectiveClientId = clientId || c.env.STRAVA_CLIENT_ID;
  const effectiveClientSecret = clientSecret || c.env.STRAVA_CLIENT_SECRET;

  if (!effectiveClientId || !effectiveClientSecret) {
    return c.json({ message: 'Client ID e Client Secret di Strava sono obbligatori' }, 400);
  }

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: effectiveClientId,
      client_secret: effectiveClientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return c.json({
      message: tokenData.message || 'Scambio token Strava fallito',
      errors: tokenData.errors,
    }, 400);
  }

  const integrationData = {
    client_id: effectiveClientId,
    client_secret: effectiveClientSecret,
    redirect_uri: redirectUri || 'https://lpt-coach.pages.dev/',
    sync_mode: syncMode || 'auto',
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    athlete: tokenData.athlete,
    connected_at: new Date().toISOString(),
    last_sync: null,
  };

  await sql`
    INSERT INTO endurance_integrations (user_id, provider, connected, data_json, updated_at)
    VALUES (${user.userId}, 'strava', 1, ${JSON.stringify(integrationData)}, NOW())
    ON CONFLICT (user_id, provider) DO UPDATE SET
      connected = 1,
      data_json = EXCLUDED.data_json,
      updated_at = NOW()
  `;

  // Find coach if any
  const coachRows = await sql`
    SELECT pt_userid FROM pt_clienti WHERE cliente_userid = ${user.userId} AND attivo = 1 LIMIT 1
  `;
  const coachId = coachRows.length ? coachRows[0].pt_userid : null;

  // Auto-sync initial activities
  let syncResult = { importedCount: 0, totalFetched: 0 };
  try {
    syncResult = await syncStravaActivities(sql, user.userId, tokenData.access_token, coachId, integrationData);
  } catch (err) {
    console.error('Strava initial sync error:', err);
  }

  return c.json({
    connected: true,
    message: 'Strava collegato con successo!',
    athlete: tokenData.athlete,
    importedCount: syncResult.importedCount,
    totalFetched: syncResult.totalFetched,
  });
});

// POST /strava/sync?utenteId=123
app.post('/sync', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);

  const allowed = await assertAccessToAthlete(sql, user, utenteId);
  if (!allowed) return c.json({ message: 'Accesso non consentito' }, 403);

  const rows = await sql`
    SELECT connected, data_json
    FROM endurance_integrations
    WHERE user_id = ${utenteId} AND provider = 'strava'
    LIMIT 1
  `;

  if (!rows.length || !rows[0].connected) {
    return c.json({ message: 'Account Strava non collegato' }, 400);
  }

  let integrationData = {};
  try { integrationData = JSON.parse(rows[0].data_json || '{}'); } catch {}

  const { accessToken, integrationData: freshData } = await getValidAccessToken(sql, utenteId, integrationData, c.env);

  if (!accessToken) {
    return c.json({ message: 'Token Strava non disponibile o non valido' }, 400);
  }

  const coachRows = await sql`
    SELECT pt_userid FROM pt_clienti WHERE cliente_userid = ${utenteId} AND attivo = 1 LIMIT 1
  `;
  const coachId = coachRows.length ? coachRows[0].pt_userid : null;

  const result = await syncStravaActivities(sql, utenteId, accessToken, coachId, freshData);

  return c.json({
    message: `Sincronizzazione completata: ${result.importedCount} nuove attività importate (${result.totalFetched} trovate).`,
    importedCount: result.importedCount,
    totalFetched: result.totalFetched,
  });
});

// POST /strava/disconnect
app.post('/disconnect', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);

  await sql`
    UPDATE endurance_integrations
    SET connected = 0, updated_at = NOW()
    WHERE user_id = ${user.userId} AND provider = 'strava'
  `;

  return c.json({ connected: false, message: 'Account Strava scollegato' });
});

export default app;
