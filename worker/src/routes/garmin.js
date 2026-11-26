import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete } from '../utils.js';
import { appUrl } from '../lib/mailer.js';
import {
  GARMIN_AUTH_URL, garminConfigured, garminRedirectUri, randomToken, pkceChallenge, exchangeCode, tokenColumns,
  garminApi, accessTokenFor, GarminError,
} from '../lib/garmin.js';
import {
  syncUserWorkouts, syncMessage, enqueueActivities, drainActivityQueue, permissionList, romeDay, SYNC_DAYS, requestActivityRefresh,
} from '../lib/garminSync.js';

// Garmin Connect: collegamento account (OAuth2 PKCE), invio della settimana di allenamenti al calendario Garmin
// (Training API) e ricezione automatica delle attivita' svolte (Activity API, notifiche push).
const app = new Hono();

// lavoro dopo la risposta (Garmin vuole il 200 entro 30 s)
function background(c, promise) {
  const safe = Promise.resolve(promise).catch((error) => console.error('garmin background', error?.message));
  try { c.executionCtx.waitUntil(safe); } catch { /* sviluppo locale: niente executionCtx */ }
  return safe;
}

function safeReturnOrigin(env, origin) {
  const value = String(origin || '').replace(/\/$/, '');
  if (!value) return null;
  if (value === appUrl(env)) return value;
  if (/^https:\/\/([a-z0-9-]+\.)?lpt-coach\.pages\.dev$/i.test(value)) return value;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)) return value;
  return null;
}

const dayString = (value) => (value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : String(value || '').slice(0, 10));

// ---------- pubbliche: ritorno da Garmin e notifiche push ----------

// GET /garmin/callback?code=&state= — Garmin rimanda qui dopo che l'atleta ha autorizzato LPT Coach
app.get('/callback', async (c) => {
  const sql = db(c.env);
  const { code, state, error } = c.req.query();
  const stateRow = state ? (await sql`DELETE FROM garmin_oauth_states WHERE state = ${String(state)} RETURNING *`)[0] : null;
  const back = (status) => c.redirect(`${stateRow?.return_to || appUrl(c.env)}/?garmin=${status}`, 302);
  if (error || !code || !stateRow) return back(error === 'access_denied' ? 'denied' : 'error');
  if (Date.now() - new Date(stateRow.created_at).getTime() > 30 * 60 * 1000) return back('error');
  try {
    const tokens = await exchangeCode(c.env, { code: String(code), verifier: stateRow.code_verifier, redirectUri: garminRedirectUri(c.env, c.req.url) });
    const cols = tokenColumns(tokens);
    // percorsi documentati nel portale (wellness-api); partner-gateway come riserva
    let idRes = await garminApi(cols.access_token, 'GET', '/wellness-api/rest/user/id');
    if (!idRes.ok) idRes = await garminApi(cols.access_token, 'GET', '/partner-gateway/rest/user/id');
    const garminUserId = idRes.data?.userId ? String(idRes.data.userId) : null;
    if (!garminUserId) throw new Error(`user id Garmin non letto (${idRes.status})`);
    let permRes = await garminApi(cols.access_token, 'GET', '/wellness-api/rest/user/permissions');
    if (!permRes.ok) permRes = await garminApi(cols.access_token, 'GET', '/partner-gateway/rest/user/permissions');
    const permissions = Array.isArray(permRes.data) ? permRes.data : (permRes.data?.permissions || []);
    // un account Garmin puo' essere collegato a un solo utente LPT
    await sql`DELETE FROM garmin_connections WHERE garmin_user_id = ${garminUserId} AND utenteid <> ${stateRow.utenteid}`;
    await sql`
      INSERT INTO garmin_connections (utenteid, garmin_user_id, access_token, refresh_token, access_expires_at, refresh_expires_at, permissions, connected_at, updated_at, last_error)
      VALUES (${stateRow.utenteid}, ${garminUserId}, ${cols.access_token}, ${cols.refresh_token}, ${cols.access_expires_at}, ${cols.refresh_expires_at},
              ${JSON.stringify(permissions)}, NOW(), NOW(), NULL)
      ON CONFLICT (utenteid) DO UPDATE SET garmin_user_id = EXCLUDED.garmin_user_id, access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token, access_expires_at = EXCLUDED.access_expires_at, refresh_expires_at = EXCLUDED.refresh_expires_at,
        permissions = EXCLUDED.permissions, updated_at = NOW(), last_error = NULL
    `;
    return back('connected');
  } catch (err) {
    console.error('garmin callback', err?.message, err?.body);
    return back('error');
  }
});

// Notifiche push (configurate nel portale Garmin, Endpoint Configuration). Rispondono sempre 200 subito.
const PUSH_KINDS = {
  'activity-files': ['activityFiles', 'file'],
  activities: ['activities', 'summary'],
  'manually-updated-activities': ['manuallyUpdatedActivities', 'summary'],
  'activity-details': ['activityDetails', 'details'],
};

app.post('/push/:kind', async (c) => {
  const kind = c.req.param('kind');
  const sql = db(c.env);
  const body = await c.req.json().catch(() => ({}));

  if (kind === 'deregistrations') {
    const ids = (body.deregistrations || []).map((entry) => String(entry.userId)).filter(Boolean);
    if (ids.length) background(c, sql`DELETE FROM garmin_connections WHERE garmin_user_id = ANY(${ids})`);
    return c.json({ ok: true });
  }
  if (kind === 'permissions') {
    const changes = (body.userPermissionsChange || []).filter((entry) => entry?.userId)
      .map((entry) => ({ id: String(entry.userId), permissions: JSON.stringify(entry.permissions || []) }));
    if (changes.length) {
      background(c, sql`
        UPDATE garmin_connections g SET permissions = x.permissions, updated_at = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS x(id text, permissions text) WHERE g.garmin_user_id = x.id
      `);
    }
    return c.json({ ok: true });
  }
  const config = PUSH_KINDS[kind];
  if (!config) return c.json({ message: 'Tipo di notifica sconosciuto' }, 404);
  const list = body[config[0]] || (Array.isArray(body) ? body : []);
  background(c, (async () => {
    const queued = await enqueueActivities(sql, config[1], list);
    if (queued) await drainActivityQueue(sql, c.env, { limit: 3 });
  })());
  return c.json({ ok: true });
});

// ---------- autenticate ----------
const auth = authenticate();

// GET /garmin/status?utenteId=
app.get('/status', auth, async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);
  if (!await assertAccessToAthlete(sql, user, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  const configured = garminConfigured(c.env);
  const connection = (await sql`
    SELECT utenteid, garmin_user_id, permissions, auto_sync, connected_at, last_push_at, last_activity_at, last_error,
           (refresh_token IS NOT NULL) AS valid
    FROM garmin_connections WHERE utenteid = ${utenteId}
  `)[0];
  if (!connection) return c.json({ configured, connected: false, giorni: SYNC_DAYS });
  const synced = await sql`
    SELECT workout_id, scheduled_date, synced_at, error FROM garmin_workout_sync
    WHERE utenteid = ${utenteId} AND scheduled_date BETWEEN ${romeDay(0)} AND ${romeDay(SYNC_DAYS)}
  `;
  return c.json({
    configured,
    connected: true,
    valid: connection.valid,
    permissions: permissionList(connection),
    auto_sync: connection.auto_sync,
    connected_at: connection.connected_at,
    last_push_at: connection.last_push_at,
    last_activity_at: connection.last_activity_at,
    last_error: connection.last_error,
    giorni: SYNC_DAYS,
    synced: synced.map((row) => ({ workout_id: row.workout_id, data: dayString(row.scheduled_date), synced_at: row.synced_at, error: row.error })),
  });
});

// POST /garmin/connect { origin } -> { url } pagina di autorizzazione Garmin (solo l'atleta collega il proprio account)
app.post('/connect', auth, async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'Garmin si collega dal profilo dell\'atleta' }, 403);
  if (!garminConfigured(c.env)) return c.json({ message: 'Il collegamento Garmin non è ancora attivo sul server' }, 503);
  const body = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const state = randomToken(40);
  const verifier = randomToken(64);
  await sql`DELETE FROM garmin_oauth_states WHERE utenteid = ${user.userId} OR created_at < NOW() - INTERVAL '1 hour'`;
  await sql`
    INSERT INTO garmin_oauth_states (state, utenteid, code_verifier, return_to)
    VALUES (${state}, ${user.userId}, ${verifier}, ${safeReturnOrigin(c.env, body.origin)})
  `;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: c.env.GARMIN_CLIENT_ID,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    redirect_uri: garminRedirectUri(c.env, c.req.url),
    state,
  });
  return c.json({ url: `${GARMIN_AUTH_URL}?${params.toString()}` });
});

// POST /garmin/disconnect — toglie da Garmin gli allenamenti futuri inviati e revoca l'autorizzazione
app.post('/disconnect', auth, async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'Solo l\'atleta può scollegare il proprio account' }, 403);
  const sql = db(c.env);
  const connection = (await sql`SELECT * FROM garmin_connections WHERE utenteid = ${user.userId}`)[0];
  if (!connection) return c.json({ message: 'Garmin non era collegato' });
  try {
    const token = await accessTokenFor(sql, c.env, connection);
    const future = await sql`
      SELECT * FROM garmin_workout_sync WHERE utenteid = ${user.userId} AND scheduled_date >= ${romeDay(0)} ORDER BY scheduled_date LIMIT 15
    `;
    for (const row of future) {
      if (row.garmin_workout_id) await garminApi(token, 'DELETE', `/training-api/workout/v2/${row.garmin_workout_id}`);
    }
    const unreg = await garminApi(token, 'DELETE', '/wellness-api/rest/user/registration');
    if (!unreg.ok && unreg.status !== 404) await garminApi(token, 'DELETE', '/partner-gateway/rest/user/registration');
  } catch (error) {
    console.error('garmin disconnect', error?.message);
  }
  await sql`DELETE FROM garmin_connections WHERE utenteid = ${user.userId}`;
  await sql`DELETE FROM garmin_workout_sync WHERE utenteid = ${user.userId}`;
  return c.json({ message: 'Account Garmin scollegato' });
});

// PUT /garmin/settings { auto_sync }
app.put('/settings', auth, async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'Impostazione dell\'atleta' }, 403);
  const { auto_sync: autoSync } = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const rows = await sql`UPDATE garmin_connections SET auto_sync = ${Boolean(autoSync)}, updated_at = NOW() WHERE utenteid = ${user.userId} RETURNING auto_sync`;
  if (!rows[0]) return c.json({ message: 'Garmin non collegato' }, 404);
  return c.json({ auto_sync: rows[0].auto_sync });
});

// POST /garmin/sync?utenteId= { workoutId? } — invia ora a Garmin (un allenamento o tutta la settimana)
app.post('/sync', auth, async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);
  if (!await assertAccessToAthlete(sql, user, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  if (!garminConfigured(c.env)) return c.json({ message: 'Il collegamento Garmin non è ancora attivo sul server' }, 503);
  const body = await c.req.json().catch(() => ({}));
  const workoutId = body.workoutId ? Number(body.workoutId) : null;
  try {
    const result = await syncUserWorkouts(sql, c.env, utenteId, { workoutId, budget: workoutId ? 6 : 32 });
    return c.json({ ...result, message: syncMessage(result) });
  } catch (err) {
    if (err instanceof GarminError) {
      return c.json({ message: err.message }, err.status === 404 ? 404 : err.status === 400 ? 400 : err.status === 401 ? 409 : 502);
    }
    throw err;
  }
});

// POST /garmin/refresh — "Sync Garmin": chiede a Garmin di rimandare le attivita' degli ultimi 7 giorni,
// cosi' titolo e descrizione cambiati su Garmin Connect (e attivita' mancanti) arrivano nell'app
app.post('/refresh', auth, async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'Il sync Garmin lo fa l\'atleta' }, 403);
  if (!garminConfigured(c.env)) return c.json({ message: 'Il collegamento Garmin non è ancora attivo sul server' }, 503);
  const sql = db(c.env);
  try {
    // intanto elabora le attivita' gia' arrivate e rimaste in coda
    try { await drainActivityQueue(sql, c.env, { limit: 2 }); } catch (error) { console.error('garmin refresh drain', error?.message); }
    return c.json(await requestActivityRefresh(sql, c.env, user.userId));
  } catch (err) {
    if (err instanceof GarminError) {
      const code = err.code || (err.status === 404 ? 'GARMIN_NOT_CONNECTED' : err.status === 401 ? 'GARMIN_RECONNECT' : undefined);
      return c.json({ message: err.message, code }, err.status === 404 ? 400 : [401, 412].includes(err.status) ? 409 : 502);
    }
    throw err;
  }
});

export default app;
