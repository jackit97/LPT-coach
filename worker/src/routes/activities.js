import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete } from '../utils.js';
import { coachOf, notify, userName, fmtDay } from '../lib/notify.js';
import { parseActivityUpload, localDay, ImportError } from '../lib/activityImport.js';
import { loadMergedZones } from '../lib/athleteData.js';
import { zoneSecondsFromSamples } from '../lib/trainingLoad.js';

// Import manuale di attivita' svolte (alternativa a Strava): file .fit / .tcx / .gpx esportati
// (anche lo .zip di "Esporta originale") da Garmin Connect, Apple Health (app di export), Coros, Suunto, Polar...
const app = new Hono();
app.use('*', authenticate());

const MAX_BYTES = 25 * 1024 * 1024;

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
}

function describe(activity) {
  const pace = activity.sport === 'corsa' && activity.distanceKm > 0 && activity.durationSeconds > 0
    ? (() => { const sec = Math.round(activity.durationSeconds / activity.distanceKm); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}/km`; })()
    : null;
  const details = [
    activity.distanceKm > 0 ? `${activity.distanceKm.toLocaleString('it-IT', { maximumFractionDigits: 2 })} km` : null,
    activity.durationSeconds > 0 ? fmtTime(activity.durationSeconds) : null,
    pace,
    activity.elevGainM ? `+${activity.elevGainM}m disl.` : null,
    activity.avgHr ? `FC ${activity.avgHr} bpm` : null,
    activity.calories ? `${activity.calories} kcal` : null,
  ].filter(Boolean).join(' · ');
  return `${details}\nImportato da file .${activity.format}`;
}

// POST /activities/import?utenteId= — corpo: il file (binario). Header X-Filename e X-Timezone opzionali.
app.post('/import', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);
  if (!await assertAccessToAthlete(sql, user, utenteId)) return c.json({ message: 'Accesso non consentito' }, 403);

  const declared = Number(c.req.header('content-length') || 0);
  if (declared > MAX_BYTES) return c.json({ message: 'File troppo grande (massimo 25 MB)' }, 413);
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length > MAX_BYTES) return c.json({ message: 'File troppo grande (massimo 25 MB)' }, 413);
  const filename = decodeURIComponent(c.req.header('x-filename') || '');

  let activity;
  try {
    activity = await parseActivityUpload(bytes, filename);
  } catch (err) {
    if (err instanceof ImportError) return c.json({ message: err.message }, 400);
    console.error('import parse', filename, err?.message);
    return c.json({ message: 'Impossibile leggere il file: assicurati che sia un .fit, .tcx, .gpx (o lo .zip di Garmin) di un\'attività svolta' }, 400);
  }
  if (!activity.durationSeconds && !activity.distanceKm) {
    return c.json({ message: 'Il file non contiene né durata né distanza: è un\'attività vuota?' }, 400);
  }

  const day = localDay(activity, c.req.header('x-timezone') || 'Europe/Rome');
  // stessa attivita' importata due volte (o anche da un altro formato): stesso sport + inizio al minuto
  const externalId = `${activity.sport || activity.tipo}-${new Date(Math.floor(activity.start.getTime() / 60000) * 60000).toISOString()}`;
  const existing = await sql`
    SELECT workout_id FROM calendar_workouts
    WHERE utenteid = ${utenteId} AND external_provider = 'file' AND external_id = ${externalId} LIMIT 1
  `;
  if (existing.length) {
    return c.json({ message: 'Questa attività è già stata importata', workout_id: existing[0].workout_id, duplicate: true }, 409);
  }

  const coachId = user.ruolo === 'personal_trainer' ? user.userId : await coachOf(sql, utenteId);
  const durationMinutes = Math.round(activity.durationSeconds / 60);
  const description = describe(activity);
  const inserted = await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, distance_km, avg_hr, elev_gain_m,
       sport, stato, external_id, external_provider)
    VALUES
      (${utenteId}, ${coachId}, ${day}, ${activity.tipo}, ${activity.title}, ${description}, ${durationMinutes}, ${activity.durationSeconds},
       ${activity.distanceKm || null}, ${activity.avgHr || null}, ${activity.elevGainM || null},
       ${activity.sport}, 'completato', ${externalId}, 'file')
    RETURNING *
  `;
  const workout = inserted[0];
  await sql`
    INSERT INTO workout_feedback (workout_id, utenteid, completato, durata_effettiva_minuti, note, updated_at)
    VALUES (${workout.workout_id}, ${utenteId}, 1, ${durationMinutes}, ${description}, NOW())
    ON CONFLICT (workout_id, utenteid) DO NOTHING
  `;

  // campioni per i grafici (FC, passo, quota, potenza, cadenza) e giri
  if (activity.streams) {
    try {
      let zoneSeconds = {};
      try { zoneSeconds = zoneSecondsFromSamples(activity.streams, (await loadMergedZones(sql, utenteId)).heartRate || []); } catch { zoneSeconds = {}; }
      await sql`
        INSERT INTO activity_streams (workout_id, source, samples_json, laps_json, zone_seconds_json)
        VALUES (${workout.workout_id}, ${activity.format}, ${JSON.stringify(activity.streams)}, ${JSON.stringify(activity.laps || [])},
                ${Object.keys(zoneSeconds).length ? JSON.stringify(zoneSeconds) : null})
        ON CONFLICT (workout_id) DO UPDATE SET samples_json = EXCLUDED.samples_json, laps_json = EXCLUDED.laps_json,
          zone_seconds_json = EXCLUDED.zone_seconds_json
      `;
    } catch (error) {
      console.error('activity_streams non salvati:', error?.message);
    }
  }

  if (user.ruolo === 'cliente' && coachId) {
    await notify(sql, coachId, {
      tipo: 'feedback',
      mittenteId: user.userId,
      titolo: `${await userName(sql, user.userId)} ha caricato "${activity.title}"`,
      messaggio: `${fmtDay(day)} · ${description.split('\n')[0]}`,
      link: { screen: 'WorkoutDetail', params: { workoutId: workout.workout_id, athleteId: user.userId } },
    });
  }

  return c.json({
    message: `Attività importata il ${fmtDay(day)}: ${description.split('\n')[0]}`,
    workout,
  }, 201);
});

export default app;
