import {
  accessTokenFor, garminApi, garminFailure, buildGarminWorkout, payloadHash, activityFromSummary, GarminError,
} from './garmin.js';
import { parseActivityUpload, sportKey, buildStreams, ImportError } from './activityImport.js';
import { saveImportedActivity } from './saveActivity.js';
import { loadMergedZones } from './athleteData.js';

export const SYNC_DAYS = 7; // oggi + 7 giorni

export function romeDay(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const dayString = (value) => (value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : String(value || '').slice(0, 10));

export function permissionList(connection) {
  try { return JSON.parse(connection?.permissions || '[]'); } catch { return []; }
}

async function deleteRemote(token, row, budget) {
  // il calendario Garmin: prima la pianificazione, poi l'allenamento (404 = gia' eliminato dall'atleta)
  if (row.garmin_schedule_id && budget.left > 0) {
    budget.left -= 1;
    const res = await garminApi(token, 'DELETE', `/training-api/schedule/${row.garmin_schedule_id}`);
    if (!res.ok && res.status !== 404) return res;
  }
  if (row.garmin_workout_id && budget.left > 0) {
    budget.left -= 1;
    const res = await garminApi(token, 'DELETE', `/training-api/workout/v2/${row.garmin_workout_id}`);
    if (!res.ok && res.status !== 404) return res;
  }
  return { ok: true };
}

/**
 * Invia al calendario Garmin gli allenamenti pianificati da oggi a oggi+7: crea i nuovi, ricrea quelli
 * modificati dal coach (confronto con l'hash del contenuto) e toglie quelli eliminati o spostati fuori dalla settimana.
 * budget: numero massimo di chiamate a Garmin in questa esecuzione (limite di subrequest di Cloudflare).
 */
export async function syncUserWorkouts(sql, env, utenteId, { workoutId = null, budget = 30 } = {}) {
  const calls = { left: budget };
  const connection = (await sql`SELECT * FROM garmin_connections WHERE utenteid = ${utenteId}`)[0];
  if (!connection) throw new GarminError('Account Garmin non collegato', 404);
  const permissions = permissionList(connection);
  if (permissions.length && !permissions.includes('WORKOUT_IMPORT')) {
    throw new GarminError('In Garmin Connect non hai consentito a LPT Coach di inviare gli allenamenti: ricollega l\'account e attiva l\'importazione allenamenti', 412);
  }
  const from = romeDay(0);
  const to = romeDay(SYNC_DAYS);

  const windowWorkouts = workoutId
    ? await sql`SELECT * FROM calendar_workouts WHERE workout_id = ${workoutId} AND utenteid = ${utenteId}`
    : await sql`SELECT * FROM calendar_workouts WHERE utenteid = ${utenteId} AND data BETWEEN ${from} AND ${to} ORDER BY data, order_index, workout_id`;
  if (workoutId) {
    const day = dayString(windowWorkouts[0]?.data);
    if (!windowWorkouts[0]) throw new GarminError('Allenamento non trovato', 404);
    if (day < from || day > to) throw new GarminError('Su Garmin si possono inviare gli allenamenti da oggi fino a 7 giorni', 400);
  }
  const ids = windowWorkouts.map((w) => w.workout_id);
  const existingRows = workoutId
    ? await sql`SELECT * FROM garmin_workout_sync WHERE workout_id = ${workoutId}`
    : await sql`SELECT * FROM garmin_workout_sync WHERE utenteid = ${utenteId} AND (scheduled_date >= ${from} OR workout_id = ANY(${ids}))`;
  const rows = new Map(existingRows.map((row) => [row.workout_id, row]));

  const strengthIds = windowWorkouts.filter((w) => w.tipo !== 'endurance').map((w) => w.workout_id);
  const sessionIds = windowWorkouts.map((w) => w.endurance_session_id).filter(Boolean);
  const exercises = strengthIds.length
    ? await sql`SELECT * FROM calendar_workout_exercises WHERE workout_id = ANY(${strengthIds}) ORDER BY workout_id, order_index, exercise_id`
    : [];
  const sessions = sessionIds.length ? await sql`SELECT session_id, sport, steps_json FROM endurance_sessions WHERE session_id = ANY(${sessionIds})` : [];
  let zones = {};
  if (sessions.length) { try { zones = await loadMergedZones(sql, utenteId); } catch { zones = {}; } }
  const exercisesBy = new Map();
  exercises.forEach((ex) => { if (!exercisesBy.has(ex.workout_id)) exercisesBy.set(ex.workout_id, []); exercisesBy.get(ex.workout_id).push(ex); });
  const sessionBy = new Map(sessions.map((s) => [s.session_id, s]));

  let token;
  const ensureToken = async () => {
    if (!token) token = await accessTokenFor(sql, env, connection);
    return token;
  };

  const upserts = [];
  const removed = [];
  const result = { inviati: 0, aggiornati: 0, rimossi: 0, invariati: 0, saltati: 0, errori: [], in_attesa: 0 };
  let fatal = null;

  for (const workout of windowWorkouts) {
    const session = sessionBy.get(workout.endurance_session_id);
    let steps = [];
    try { steps = JSON.parse(session?.steps_json || '[]'); } catch { steps = []; }
    const payload = buildGarminWorkout(workout, { steps, sport: session?.sport || workout.sport, zones, exercises: exercisesBy.get(workout.workout_id) || [] });
    const row = rows.get(workout.workout_id);
    rows.delete(workout.workout_id);
    const date = dayString(workout.data);
    if (!payload) {
      // svolto o importato: quello gia' presente su Garmin resta (e' storico), il resto non si invia
      if (row && workout.stato !== 'completato' && !workout.external_provider) rows.set(workout.workout_id, row);
      else result.saltati += 1;
      continue;
    }
    const hash = await payloadHash(payload, date);
    if (row && row.payload_hash === hash && row.garmin_workout_id && row.garmin_schedule_id) { result.invariati += 1; continue; }
    if (fatal || calls.left < (row ? 4 : 2)) { result.in_attesa += 1; continue; }
    try {
      await ensureToken();
    } catch (error) { fatal = error; result.in_attesa += 1; continue; }
    if (row) {
      const del = await deleteRemote(token, row, calls);
      if (!del.ok) {
        result.errori.push(garminFailure(del, `"${workout.titolo}"`));
        if ([401, 412, 429].includes(del.status)) fatal = new GarminError(garminFailure(del, 'Garmin'), del.status);
        continue;
      }
    }
    calls.left -= 1;
    const created = await garminApi(token, 'POST', '/workoutportal/workout/v2', payload);
    const garminWorkoutId = created.data?.workoutId;
    if (!created.ok || !garminWorkoutId) {
      result.errori.push(garminFailure(created, `"${workout.titolo}"`));
      if ([401, 412, 429].includes(created.status)) fatal = new GarminError(garminFailure(created, 'Garmin'), created.status);
      if (row) removed.push(workout.workout_id);
      continue;
    }
    calls.left -= 1;
    const scheduled = await garminApi(token, 'POST', '/training-api/schedule/', { workoutId: garminWorkoutId, date });
    const scheduleId = typeof scheduled.data === 'number' ? scheduled.data : (scheduled.data?.scheduleId ?? scheduled.data?.id ?? null);
    if (!scheduled.ok || !scheduleId) {
      result.errori.push(garminFailure(scheduled, `"${workout.titolo}" (pianificazione)`));
      upserts.push({ workout_id: workout.workout_id, garmin_workout_id: garminWorkoutId, garmin_schedule_id: null, scheduled_date: date, payload_hash: null, error: 'schedule' });
      continue;
    }
    upserts.push({ workout_id: workout.workout_id, garmin_workout_id: garminWorkoutId, garmin_schedule_id: scheduleId, scheduled_date: date, payload_hash: hash, error: null });
    if (row) result.aggiornati += 1; else result.inviati += 1;
  }

  // rimasti in "rows": non piu' nella settimana (eliminati, spostati o diventati riposo) -> via da Garmin
  if (!workoutId) {
    for (const row of rows.values()) {
      if (dayString(row.scheduled_date) < from) continue;
      if (fatal || calls.left < 2) { result.in_attesa += 1; continue; }
      try { await ensureToken(); } catch (error) { fatal = error; continue; }
      const del = await deleteRemote(token, row, calls);
      if (del.ok) { removed.push(row.workout_id); result.rimossi += 1; } else {
        result.errori.push(garminFailure(del, 'Rimozione da Garmin'));
        if ([401, 412, 429].includes(del.status)) fatal = new GarminError(garminFailure(del, 'Garmin'), del.status);
      }
    }
  }

  if (upserts.length) {
    await sql`
      INSERT INTO garmin_workout_sync (workout_id, utenteid, garmin_workout_id, garmin_schedule_id, scheduled_date, payload_hash, error, synced_at)
      SELECT x.workout_id, ${utenteId}, x.garmin_workout_id, x.garmin_schedule_id, x.scheduled_date, x.payload_hash, x.error, NOW()
      FROM jsonb_to_recordset(${JSON.stringify(upserts)}::jsonb)
        AS x(workout_id int, garmin_workout_id bigint, garmin_schedule_id bigint, scheduled_date date, payload_hash text, error text)
      ON CONFLICT (workout_id) DO UPDATE SET garmin_workout_id = EXCLUDED.garmin_workout_id, garmin_schedule_id = EXCLUDED.garmin_schedule_id,
        scheduled_date = EXCLUDED.scheduled_date, payload_hash = EXCLUDED.payload_hash, error = EXCLUDED.error, synced_at = NOW()
    `;
  }
  if (removed.length) await sql`DELETE FROM garmin_workout_sync WHERE workout_id = ANY(${removed}) AND utenteid = ${utenteId}`;
  const lastError = fatal?.message || (result.errori.length ? result.errori[0] : null);
  await sql`
    UPDATE garmin_connections SET last_push_at = CASE WHEN ${!fatal && !result.in_attesa} THEN NOW() ELSE last_push_at END,
      last_error = ${lastError}, updated_at = NOW()
    WHERE utenteid = ${utenteId}
  `;
  if (fatal && !result.inviati && !result.aggiornati && !result.rimossi) throw fatal;
  return { ...result, dal: from, al: to };
}

export function syncMessage(result) {
  const parts = [];
  if (result.inviati) parts.push(`${result.inviati} inviati`);
  if (result.aggiornati) parts.push(`${result.aggiornati} aggiornati`);
  if (result.rimossi) parts.push(`${result.rimossi} rimossi`);
  if (result.invariati) parts.push(`${result.invariati} già presenti`);
  let text = parts.length ? `Allenamenti su Garmin: ${parts.join(', ')}.` : 'Nessun allenamento da inviare nei prossimi 7 giorni.';
  if (result.in_attesa) text += ` ${result.in_attesa} verranno inviati a breve in automatico.`;
  if (result.errori?.length) text += ` Problemi: ${result.errori.slice(0, 2).join('; ')}`;
  return text;
}

// ---------- attivita' svolte ricevute da Garmin ----------

const ALLOWED_DOWNLOAD = /^https:\/\/([a-z0-9-]+\.)*garmin\.com\//i;

function streamsFromSamples(samples, start) {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  const points = samples.map((s) => ({
    t: Number.isFinite(Number(s.timerDurationInSeconds)) ? Number(s.timerDurationInSeconds) : Number(s.startTimeInSeconds) - start,
    d: s.totalDistanceInMeters, hr: s.heartRate, alt: s.elevationInMeters, spd: s.speedMetersPerSecond,
    pwr: s.powerInWatts, cad: s.stepsPerMinute ?? s.bikeCadenceInRPM ?? s.swimCadenceInStrokesPerMinute,
  }));
  try { return buildStreams(points); } catch { return null; }
}

async function processQueueItem(sql, env, item, connection) {
  const payload = JSON.parse(item.payload);
  let activity;
  if (item.kind === 'file') {
    if (!ALLOWED_DOWNLOAD.test(String(payload.callbackURL || ''))) return { done: true, skipped: 'url' };
    const token = await accessTokenFor(sql, env, connection);
    const response = await fetch(payload.callbackURL, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 410 || response.status === 404) return { done: true, skipped: 'scaduto' };
    if (!response.ok) throw new Error(`download ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
      activity = await parseActivityUpload(bytes, `garmin-${payload.activityId || payload.summaryId}.${String(payload.fileType || 'fit').toLowerCase()}`);
    } catch (error) {
      if (error instanceof ImportError) return { done: true, skipped: error.message };
      throw error;
    }
    activity.format = String(payload.fileType || 'fit').toLowerCase();
    if (payload.activityName) {
      // il nome su Garmin Connect (anche se rinominata) vale piu' di quello scritto nel file dall'orologio
      activity.name = payload.activityName;
      activity.title = String(payload.activityName).slice(0, 255);
    }
    activity.notes = payload.description || payload.activityDescription || payload.notes || null;
  } else {
    const summary = item.kind === 'details' ? (payload.summary || payload) : payload;
    activity = activityFromSummary(summary, sportKey);
    if (item.kind === 'details') {
      const streams = streamsFromSamples(payload.samples, Number(summary.startTimeInSeconds));
      if (streams) activity.streams = streams;
      activity.laps = (payload.laps || []).map((lap) => ({ start: lap.startTimeInSeconds }));
    }
  }
  if (!activity?.start || Number.isNaN(activity.start.getTime())) return { done: true, skipped: 'data' };
  if (!activity.durationSeconds && !activity.distanceKm) return { done: true, skipped: 'vuota' };
  const saved = await saveImportedActivity(sql, { utenteId: connection.utenteid, activity, provider: 'garmin' });
  await sql`UPDATE garmin_connections SET last_activity_at = NOW() WHERE utenteid = ${connection.utenteid}`;
  return { done: true, saved };
}

/** Elabora fino a "limit" attivita' in coda (ogni file costa ~10 subrequest). */
export async function drainActivityQueue(sql, env, { limit = 3 } = {}) {
  // Le notifiche di Garmin arrivano quasi insieme (riepilogo + file): ogni elemento viene "prenotato" in modo atomico
  // cosi' due elaborazioni in parallelo non importano la stessa attivita' due volte.
  let items;
  try {
    items = await sql`
      WITH picked AS (
        SELECT queue_id FROM garmin_activity_queue
        WHERE attempts < 5 AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '5 minutes')
        ORDER BY queue_id LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      UPDATE garmin_activity_queue q SET claimed_at = NOW() FROM picked WHERE q.queue_id = picked.queue_id
      RETURNING q.*, (SELECT c.utenteid FROM garmin_connections c WHERE c.garmin_user_id = q.garmin_user_id) AS c_utenteid
    `;
  } catch (error) {
    if (!/claimed_at/.test(String(error?.message))) throw error; // migrazione 20261128 non ancora applicata
    items = await sql`
      SELECT q.*, c.utenteid AS c_utenteid FROM garmin_activity_queue q
      LEFT JOIN garmin_connections c ON c.garmin_user_id = q.garmin_user_id
      WHERE q.attempts < 5 ORDER BY q.queue_id LIMIT ${limit}
    `;
  }
  items.sort((a, b) => a.queue_id - b.queue_id);
  const done = [];
  const failed = [];
  const connections = new Map();
  let processed = 0;
  for (const item of items) {
    if (!item.c_utenteid) { done.push(item.queue_id); continue; } // utente non piu' collegato
    try {
      if (!connections.has(item.c_utenteid)) {
        connections.set(item.c_utenteid, (await sql`SELECT * FROM garmin_connections WHERE utenteid = ${item.c_utenteid}`)[0]);
      }
      const connection = connections.get(item.c_utenteid);
      if (!connection) { done.push(item.queue_id); continue; }
      await processQueueItem(sql, env, item, connection);
      done.push(item.queue_id);
      processed += 1;
    } catch (error) {
      console.error('garmin activity', item.queue_id, error?.message);
      failed.push({ id: item.queue_id, error: String(error?.message || error).slice(0, 300) });
    }
  }
  if (done.length) await sql`DELETE FROM garmin_activity_queue WHERE queue_id = ANY(${done})`;
  if (failed.length) {
    const json = JSON.stringify(failed);
    try {
      await sql`
        UPDATE garmin_activity_queue q SET attempts = q.attempts + 1, last_error = x.error, claimed_at = NULL
        FROM jsonb_to_recordset(${json}::jsonb) AS x(id int, error text) WHERE q.queue_id = x.id
      `;
    } catch {
      await sql`
        UPDATE garmin_activity_queue q SET attempts = q.attempts + 1, last_error = x.error
        FROM jsonb_to_recordset(${json}::jsonb) AS x(id int, error text) WHERE q.queue_id = x.id
      `;
    }
  }
  // pulizia: elementi falliti troppe volte o piu' vecchi di 2 giorni (i link dei file valgono 24 h)
  await sql`DELETE FROM garmin_activity_queue WHERE attempts >= 5 OR created_at < NOW() - INTERVAL '2 days'`;
  return { processed, remaining: Math.max(0, items.length - done.length) };
}

// Mette in coda le attivita' di una notifica push di Garmin (una sola query)
export async function enqueueActivities(sql, kind, list) {
  const items = (Array.isArray(list) ? list : [])
    .filter((entry) => entry && (entry.userId || entry.summary?.userId))
    .slice(0, 200)
    .map((entry) => ({ garmin_user_id: String(entry.userId || entry.summary?.userId), kind, payload: JSON.stringify(entry) }));
  if (!items.length) return 0;
  await sql`
    INSERT INTO garmin_activity_queue (garmin_user_id, kind, payload)
    SELECT garmin_user_id, kind, payload FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(garmin_user_id text, kind text, payload text)
  `;
  return items.length;
}

/** Cron: prima le attivita' arrivate, poi la settimana di allenamenti degli atleti con sincronizzazione automatica. */
export async function runGarminCron(sql, env) {
  if (!env.GARMIN_CLIENT_ID) return { skipped: true };
  // Piano gratuito di Cloudflare: 50 subrequest per esecuzione (ogni query e ogni chiamata a Garmin conta)
  const drained = await drainActivityQueue(sql, env, { limit: 2 });
  await sql`DELETE FROM garmin_oauth_states WHERE created_at < NOW() - INTERVAL '1 hour'`;
  await sql`DELETE FROM garmin_workout_sync WHERE scheduled_date < CURRENT_DATE - 60`;
  const users = await sql`
    SELECT utenteid FROM garmin_connections
    WHERE auto_sync = TRUE AND refresh_token IS NOT NULL
    ORDER BY last_push_at ASC NULLS FIRST LIMIT ${drained.processed ? 1 : 2}
  `;
  const synced = [];
  for (const { utenteid } of users) {
    try {
      synced.push({ utenteid, ...(await syncUserWorkouts(sql, env, utenteid, { budget: drained.processed ? 6 : 10 })) });
    } catch (error) {
      synced.push({ utenteid, error: error.message });
      try { await sql`UPDATE garmin_connections SET last_error = ${String(error.message).slice(0, 500)}, last_push_at = NOW() WHERE utenteid = ${utenteid}`; } catch { /* ignore */ }
    }
  }
  return { drained, synced };
}

// ---------- "Sync Garmin": Garmin rimanda le attivita' recenti (nome e dati aggiornati) ----------
export const BACKFILL_DAYS = 7;

export async function requestActivityRefresh(sql, env, utenteId) {
  const connection = (await sql`SELECT * FROM garmin_connections WHERE utenteid = ${utenteId}`)[0];
  if (!connection) throw new GarminError('Account Garmin non collegato', 404);
  const last = connection.last_backfill_at ? new Date(connection.last_backfill_at).getTime() : null;
  if (last && Date.now() - last < 10 * 60 * 1000) {
    return { requested: false, message: 'Aggiornamento già richiesto da poco: le attività arrivano entro qualche minuto.' };
  }
  const token = await accessTokenFor(sql, env, connection);
  const end = Math.floor(Date.now() / 1000);
  const start = end - BACKFILL_DAYS * 86400;
  let accepted = 0;
  let lastFailure = null;
  for (const kind of ['activities', 'activityFiles']) {
    const res = await garminApi(token, 'GET', `/wellness-api/rest/backfill/${kind}?summaryStartTimeInSeconds=${start}&summaryEndTimeInSeconds=${end}`);
    if (res.ok || res.status === 409) accepted += 1; // 409 = stesso periodo gia' richiesto
    else lastFailure = res;
  }
  try { await sql`UPDATE garmin_connections SET last_backfill_at = NOW() WHERE utenteid = ${utenteId}`; } catch { /* migrazione 20261201 */ }
  if (!accepted && lastFailure) throw new GarminError(garminFailure(lastFailure, 'Aggiornamento da Garmin'), lastFailure.status === 401 ? 401 : 502);
  return { requested: true, message: `Richiesta inviata a Garmin: le attività degli ultimi ${BACKFILL_DAYS} giorni, con titolo e descrizione aggiornati, arrivano entro qualche minuto.` };
}
