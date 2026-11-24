import { Hono } from 'hono';
import { db } from '../db.js';
import { sign, verify } from 'hono/jwt';
import { authenticate } from '../auth.js';
import { assertAccessToAthlete, resolveTargetUserId } from '../utils.js';

const app = new Hono();
// Il callback OAuth arriva dalla pagina /strava-callback senza token: l'utente e' identificato dallo "state" firmato.
app.use('*', async (c, next) => (c.req.path.endsWith('/oauth/callback') ? next() : authenticate()(c, next)));

const STRAVA_SCOPE = 'read,activity:read_all,profile:read_all';
const DEFAULT_APP_ORIGIN = 'https://lpt-coach.pages.dev';
const STATE_TTL_SECONDS = 15 * 60;

function appOrigin(env, requested) {
  // Accetta solo origin http(s) senza path: e' il dominio registrato come "Authorization Callback Domain" su Strava
  try {
    const url = new URL(requested || env.APP_ORIGIN || DEFAULT_APP_ORIGIN);
    if (!/^https?:$/.test(url.protocol)) throw new Error('protocol');
    return url.origin;
  } catch {
    return env.APP_ORIGIN || DEFAULT_APP_ORIGIN;
  }
}

// Salva i token ottenuti da Strava e importa subito le ultime attivita'.
async function saveConnection(sql, userId, tokenData, { clientId, clientSecret, redirectUri, syncMode }) {
  const integrationData = {
    client_id: clientId,
    // il secret resta solo se fornito dall'utente (vecchio flusso); con le variabili del Worker non serve salvarlo
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    redirect_uri: redirectUri,
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
    VALUES (${userId}, 'strava', 1, ${JSON.stringify(integrationData)}, NOW())
    ON CONFLICT (user_id, provider) DO UPDATE SET connected = 1, data_json = EXCLUDED.data_json, updated_at = NOW()
  `;
  const coachRows = await sql`SELECT pt_userid FROM pt_clienti WHERE cliente_userid = ${userId} AND attivo = 1 LIMIT 1`;
  const coachId = coachRows.length ? coachRows[0].pt_userid : null;
  let syncResult = { importedCount: 0, totalFetched: 0 };
  try {
    syncResult = await syncStravaActivities(sql, userId, tokenData.access_token, coachId, integrationData);
  } catch (err) {
    console.error('Strava initial sync error:', err);
  }
  return syncResult;
}

async function getValidAccessToken(sql, userId, integrationData, env) {
  let { access_token, refresh_token, expires_at, client_id, client_secret } = integrationData;
  const now = Math.floor(Date.now() / 1000);

  if (expires_at && expires_at < now + 120 && refresh_token) {
    // Il token si rinnova solo con le credenziali dell'app Strava che l'ha emesso:
    // prima quelle salvate col collegamento (se presenti), poi quelle del Worker.
    const candidates = [
      [client_id, client_secret],
      [env.STRAVA_CLIENT_ID, env.STRAVA_CLIENT_SECRET],
      [client_id, env.STRAVA_CLIENT_SECRET],
    ].filter(([id, secret], index, list) => id && secret
      && list.findIndex(([otherId, otherSecret]) => String(otherId) === String(id) && otherSecret === secret) === index);

    for (const [clientId, clientSecret] of candidates) {
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

      if (!res.ok) {
        console.error('Strava refresh token failed', userId, clientId, res.status, await res.text());
        continue;
      }
      {
        const refreshed = await res.json();
        access_token = refreshed.access_token;
        refresh_token = refreshed.refresh_token;
        expires_at = refreshed.expires_at;

        const updatedData = {
          ...integrationData,
          client_id: clientId,
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
    // Token scaduto e rinnovo non riuscito: serve ricollegare l'account
    return { accessToken: null, integrationData, expired: true };
  }

  return { accessToken: access_token, integrationData };
}

async function syncStravaActivities(sql, userId, accessToken, coachId, integrationData) {
  const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    const error = new Error(`Errore Strava API: ${res.status} ${errorText}`);
    error.stravaStatus = res.status;
    throw error;
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
      // gia' arrivata da Garmin o da file (anche unita a un allenamento del coach): stesso giorno, sport e durata simile
      const already = await sql`
        SELECT w.workout_id FROM calendar_workouts w
        LEFT JOIN workout_feedback f ON f.workout_id = w.workout_id AND f.utenteid = w.utenteid
        WHERE w.utenteid = ${userId} AND w.data = ${date} AND w.external_provider IN ('garmin', 'file')
          AND (w.sport = ${sportKey} OR w.sport IS NULL OR ${sportKey}::text IS NULL)
          AND ABS(COALESCE(f.durata_effettiva_minuti * 60, w.durata_secondi, 0) - ${durationSeconds}) <= 120
        LIMIT 1
      `;
      if (already.length) continue;
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

// POST /strava/authorize { platform: 'web' | 'native', origin }
// Restituisce i link di autorizzazione: "appUrl" apre direttamente l'app Strava (mobile),
// "url" e' la pagina web di Strava. Dopo l'accesso Strava rimanda a <origin>/strava-callback.
app.post('/authorize', async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'Solo gli atleti possono collegare Strava' }, 403);
  const clientId = c.env.STRAVA_CLIENT_ID;
  if (!clientId || !c.env.STRAVA_CLIENT_SECRET) {
    return c.json({ message: 'Strava non è ancora configurato: il coach deve impostare STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET sul Worker.' }, 503);
  }
  const body = await c.req.json().catch(() => ({}));
  const platform = body.platform === 'native' ? 'native' : 'web';
  const redirectUri = `${appOrigin(c.env, platform === 'web' ? body.origin : null)}/strava-callback`;
  const state = await sign({
    uid: user.userId,
    purpose: 'strava-connect',
    platform,
    ruri: redirectUri,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  }, c.env.JWT_SECRET || 'dev-secret');
  const params = new URLSearchParams({
    client_id: String(clientId),
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state,
  }).toString();
  return c.json({
    url: platform === 'native' ? `https://www.strava.com/oauth/mobile/authorize?${params}` : `https://www.strava.com/oauth/authorize?${params}`,
    appUrl: `strava://oauth/mobile/authorize?${params}`,
  });
});

// POST /strava/oauth/callback { code, state, scope } - chiamato dalla pagina /strava-callback (senza login)
app.post('/oauth/callback', async (c) => {
  const { code, state, scope, error } = await c.req.json().catch(() => ({}));
  if (error) return c.json({ message: error === 'access_denied' ? 'Autorizzazione annullata su Strava.' : `Strava ha restituito un errore: ${error}` }, 400);
  if (!code || !state) return c.json({ message: 'Parametri di autorizzazione mancanti' }, 400);
  let payload;
  try {
    payload = await verify(state, c.env.JWT_SECRET || 'dev-secret', 'HS256');
  } catch {
    return c.json({ message: 'Link di collegamento scaduto: riprova da LPT Coach.' }, 400);
  }
  if (payload.purpose !== 'strava-connect' || !payload.uid) return c.json({ message: 'Richiesta non valida' }, 400);
  if (scope && !String(scope).includes('activity:read')) {
    return c.json({ message: 'Per importare gli allenamenti devi lasciare attivo il permesso di lettura delle attività.', platform: payload.platform }, 400);
  }
  const clientId = c.env.STRAVA_CLIENT_ID;
  const clientSecret = c.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return c.json({ message: 'Strava non configurato sul server' }, 503);

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) return c.json({ message: tokenData.message || 'Scambio token Strava fallito', platform: payload.platform }, 400);

  const sql = db(c.env);
  const result = await saveConnection(sql, payload.uid, tokenData, { clientId, redirectUri: payload.ruri });
  return c.json({
    connected: true,
    platform: payload.platform,
    athlete: tokenData.athlete ? { firstname: tokenData.athlete.firstname, lastname: tokenData.athlete.lastname } : null,
    importedCount: result.importedCount,
  });
});

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
      hasServerApp: Boolean(defaultClientId && c.env.STRAVA_CLIENT_SECRET),
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
    hasServerApp: Boolean(defaultClientId && c.env.STRAVA_CLIENT_SECRET),
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

  const syncResult = await saveConnection(sql, user.userId, tokenData, {
    clientId: effectiveClientId,
    clientSecret: clientSecret || null,
    redirectUri: redirectUri || DEFAULT_APP_ORIGIN,
    syncMode,
  });

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
    return c.json({ message: 'Account Strava non collegato', code: 'STRAVA_NOT_CONNECTED' }, 400);
  }

  let integrationData = {};
  try { integrationData = JSON.parse(rows[0].data_json || '{}'); } catch {}

  const { accessToken, integrationData: freshData, expired } = await getValidAccessToken(sql, utenteId, integrationData, c.env);

  if (!accessToken) {
    return c.json({ message: expired
      ? 'Il collegamento con Strava è scaduto: vai nel Profilo, scollega e ricollega Strava.'
      : 'Token Strava non disponibile o non valido: ricollega Strava dal Profilo.', code: 'STRAVA_RECONNECT' }, 400);
  }

  const coachRows = await sql`
    SELECT pt_userid FROM pt_clienti WHERE cliente_userid = ${utenteId} AND attivo = 1 LIMIT 1
  `;
  const coachId = coachRows.length ? coachRows[0].pt_userid : null;

  let result;
  try {
    result = await syncStravaActivities(sql, utenteId, accessToken, coachId, freshData);
  } catch (err) {
    console.error('Strava sync error', utenteId, err?.message);
    if (err?.stravaStatus === 401) {
      return c.json({ message: 'Strava ha rifiutato l\'accesso: vai nel Profilo, scollega e ricollega Strava.' }, 400);
    }
    if (err?.stravaStatus === 403 && /Inactive/i.test(err?.message || '')) {
      return c.json({ message: 'L\'app Strava di LPT Coach risulta inattiva: chi ha creato l\'app su Strava deve avere un abbonamento Strava attivo. Il coach deve verificarlo nelle impostazioni API di Strava.' }, 503);
    }
    if (err?.stravaStatus === 429) {
      return c.json({ message: 'Troppe richieste a Strava in questo momento: riprova tra 15 minuti.' }, 429);
    }
    return c.json({ message: `Sincronizzazione Strava non riuscita: ${err?.message || 'errore sconosciuto'}` }, 502);
  }

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
