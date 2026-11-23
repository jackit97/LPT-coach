import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete } from '../utils.js';
import { fmtDay } from '../lib/notify.js';
import { parseActivityUpload, ImportError } from '../lib/activityImport.js';
import { saveImportedActivity } from '../lib/saveActivity.js';

// Import manuale di attivita' svolte (alternativa a Strava/Garmin automatico): file .fit / .tcx / .gpx esportati
// (anche lo .zip di "Esporta originale") da Garmin Connect, Apple Health (app di export), Coros, Suunto, Polar...
const app = new Hono();
app.use('*', authenticate());

const MAX_BYTES = 25 * 1024 * 1024;

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

  const result = await saveImportedActivity(sql, {
    utenteId, activity, provider: 'file', actor: user, timeZone: c.req.header('x-timezone') || 'Europe/Rome',
  });
  if (result.duplicate) {
    return c.json({ message: 'Questa attività è già stata importata', workout_id: result.workout.workout_id, duplicate: true }, 409);
  }
  return c.json({
    message: `Attività importata il ${fmtDay(result.day)}: ${result.description.split('\n')[0]}`,
    workout: result.workout,
  }, 201);
});

export default app;
