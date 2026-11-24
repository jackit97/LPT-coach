import { coachOf, notify, userName, fmtDay } from './notify.js';
import { localDay } from './activityImport.js';
import { loadMergedZones } from './athleteData.js';
import { zoneSecondsFromSamples } from './trainingLoad.js';

// Salvataggio comune delle attivita' svolte: import manuale da file e sincronizzazione automatica Garmin.

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
}

const SOURCE_LABEL = { file: null, garmin: 'Sincronizzato da Garmin Connect' };

export function describeActivity(activity, provider = 'file') {
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
  return `${details}\n${SOURCE_LABEL[provider] || `Importato da file .${activity.format}`}`;
}

// stessa attivita' (anche da un altro formato): stesso sport + inizio al minuto
export function activityExternalId(activity) {
  return `${activity.sport || activity.tipo}-${new Date(Math.floor(activity.start.getTime() / 60000) * 60000).toISOString()}`;
}

async function saveStreams(sql, workoutId, utenteId, activity) {
  if (!activity.streams) return;
  try {
    let zoneSeconds = {};
    try { zoneSeconds = zoneSecondsFromSamples(activity.streams, (await loadMergedZones(sql, utenteId)).heartRate || []); } catch { zoneSeconds = {}; }
    await sql`
      INSERT INTO activity_streams (workout_id, source, samples_json, laps_json, zone_seconds_json)
      VALUES (${workoutId}, ${activity.format}, ${JSON.stringify(activity.streams)}, ${JSON.stringify(activity.laps || [])},
              ${Object.keys(zoneSeconds).length ? JSON.stringify(zoneSeconds) : null})
      ON CONFLICT (workout_id) DO UPDATE SET samples_json = EXCLUDED.samples_json, laps_json = EXCLUDED.laps_json,
        zone_seconds_json = EXCLUDED.zone_seconds_json
    `;
  } catch (error) {
    console.error('activity_streams non salvati:', error?.message);
  }
}

const FAMILY = (tipo) => (['forza', 'funzionale'].includes(tipo) ? 'forza' : tipo || 'altro');

// inizio attivita' dall'external_id "<sport>-<ISO>" (import da file e Garmin)
function startFromExternalId(externalId) {
  const iso = String(externalId || '').replace(/^[a-z]+-/i, '');
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

async function updateExisting(sql, workoutId, utenteId, activity) {
  const minutes = Math.round((activity.durationSeconds || 0) / 60);
  await sql`
    UPDATE calendar_workouts SET distance_km = COALESCE(${activity.distanceKm || null}, distance_km),
      avg_hr = COALESCE(${activity.avgHr || null}, avg_hr), elev_gain_m = COALESCE(${activity.elevGainM || null}, elev_gain_m), updated_at = NOW()
    WHERE workout_id = ${workoutId}
  `;
  if (minutes) {
    await sql`
      INSERT INTO workout_feedback (workout_id, utenteid, completato, durata_effettiva_minuti, updated_at)
      VALUES (${workoutId}, ${utenteId}, 1, ${minutes}, NOW())
      ON CONFLICT (workout_id, utenteid) DO UPDATE SET completato = 1, durata_effettiva_minuti = EXCLUDED.durata_effettiva_minuti, updated_at = NOW()
    `;
  }
  await saveStreams(sql, workoutId, utenteId, activity);
}

/**
 * Salva un'attivita' svolta nel calendario dell'atleta, evitando i doppioni:
 * 1. la stessa attivita' gia' presente (stesso inizio +/- 2 min, oppure stesso sport e durata da Strava):
 *    da Garmin viene aggiornata (es. prima il riepilogo e poi il file), da file e' un doppione;
 * 2. se quel giorno c'e' un allenamento pianificato dal coach dello stesso tipo/sport (anche gia' segnato "Fatto"),
 *    l'attivita' viene unita a quello: diventa completato con i dati reali, senza creare una seconda scheda;
 * 3. altrimenti nuova attivita' completata.
 */
export async function saveImportedActivity(sql, { utenteId, activity, provider = 'file', actor = null, timeZone = 'Europe/Rome' }) {
  const day = localDay(activity, timeZone);
  const externalId = activityExternalId(activity);
  const durationMinutes = Math.round((activity.durationSeconds || 0) / 60);
  const description = describeActivity(activity, provider);
  const family = FAMILY(activity.tipo);
  const startMs = activity.start.getTime();

  const sameDay = await sql`
    SELECT w.workout_id, w.tipo, w.sport, w.stato, w.titolo, w.external_provider, w.external_id, w.durata_secondi, w.order_index,
           f.durata_effettiva_minuti
    FROM calendar_workouts w
    LEFT JOIN workout_feedback f ON f.workout_id = w.workout_id AND f.utenteid = w.utenteid
    WHERE w.utenteid = ${utenteId} AND w.data = ${day}
    ORDER BY w.order_index, w.workout_id
  `;

  const sameSport = (row) => FAMILY(row.tipo) === family && (family !== 'endurance' || !activity.sport || !row.sport || row.sport === activity.sport);
  const existing = sameDay.find((row) => {
    if (!row.external_provider) return false;
    if (row.external_id === externalId) return true;
    const start = startFromExternalId(row.external_id);
    if (start !== null) return Math.abs(start - startMs) <= 120000 && sameSport(row);
    // Strava (id numerico): stesso sport e durata simile
    const seconds = row.durata_effettiva_minuti ? row.durata_effettiva_minuti * 60 : row.durata_secondi;
    return sameSport(row) && seconds && Math.abs(seconds - (activity.durationSeconds || 0)) <= 120;
  });
  if (existing) {
    if (provider === 'garmin' && existing.external_provider === 'garmin') {
      await updateExisting(sql, existing.workout_id, utenteId, activity);
      return { workout: { workout_id: existing.workout_id }, updated: true, day, description };
    }
    return { workout: { workout_id: existing.workout_id }, duplicate: true, day, description };
  }

  // allenamento pianificato del giorno: prima quelli da fare, poi quelli gia' segnati "Fatto" a mano
  // per l'endurance serve lo stesso sport (una camminata non completa la corsa pianificata)
  const plannedMatch = (row) => FAMILY(row.tipo) === family && (family !== 'endurance' || (activity.sport && (!row.sport || row.sport === activity.sport)));
  const candidates = sameDay.filter((row) => !row.external_provider && row.stato !== 'saltato' && plannedMatch(row));
  const planned = candidates.find((row) => row.stato !== 'completato') || candidates[0];
  if (planned) {
    const merged = await sql`
      UPDATE calendar_workouts SET stato = 'completato', external_provider = ${provider}, external_id = ${externalId},
        distance_km = ${activity.distanceKm || null}, avg_hr = ${activity.avgHr || null}, elev_gain_m = ${activity.elevGainM || null},
        sport = COALESCE(sport, ${activity.sport || null}), updated_at = NOW()
      WHERE workout_id = ${planned.workout_id} AND external_provider IS NULL
      RETURNING *
    `;
    if (merged[0]) {
      const workout = merged[0];
      await sql`
        INSERT INTO workout_feedback (workout_id, utenteid, completato, durata_effettiva_minuti, note, updated_at)
        VALUES (${workout.workout_id}, ${utenteId}, 1, ${durationMinutes || null}, ${description}, NOW())
        ON CONFLICT (workout_id, utenteid) DO UPDATE SET completato = 1,
          durata_effettiva_minuti = COALESCE(EXCLUDED.durata_effettiva_minuti, workout_feedback.durata_effettiva_minuti),
          note = COALESCE(workout_feedback.note, EXCLUDED.note), updated_at = NOW()
      `;
      await saveStreams(sql, workout.workout_id, utenteId, activity);
      await notifyCoach(sql, { utenteId, actor, provider, workout, day, description, verb: 'completato' });
      return { workout, merged: true, day, description };
    }
    // un'altra notifica (es. riepilogo + file arrivati insieme) l'ha appena unito: aggiorno quello
    const again = await sql`SELECT workout_id FROM calendar_workouts WHERE workout_id = ${planned.workout_id} AND external_id = ${externalId}`;
    if (again[0]) {
      await updateExisting(sql, again[0].workout_id, utenteId, activity);
      return { workout: again[0], updated: true, day, description };
    }
  }

  // L'orologio salva il nome dell'allenamento accorciato (es. "Ripetute 6x1000 m Z" invece del titolo completo
  // dato dal coach): se in calendario, a +/- 3 giorni, c'e' un allenamento il cui titolo inizia cosi', si usa quello intero.
  if (activity.name && activity.title === String(activity.name).slice(0, 255)) {
    const short = String(activity.name).trim();
    try {
      const planned = await sql`
        SELECT titolo FROM calendar_workouts
        WHERE utenteid = ${utenteId} AND external_provider IS NULL AND data BETWEEN ${day}::date - 3 AND ${day}::date + 3
          AND LENGTH(titolo) > ${short.length} AND LOWER(LEFT(titolo, ${short.length})) = ${short.toLowerCase()}
        ORDER BY ABS(data - ${day}::date) ASC LIMIT 1
      `;
      if (planned[0]?.titolo) activity.title = planned[0].titolo;
    } catch { /* tengo il nome del file */ }
  }

  const coachId = actor?.ruolo === 'personal_trainer' ? actor.userId : await coachOf(sql, utenteId);
  let inserted;
  try {
    inserted = await sql`
      INSERT INTO calendar_workouts
        (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, distance_km, avg_hr, elev_gain_m,
         sport, stato, external_id, external_provider)
      VALUES
        (${utenteId}, ${coachId}, ${day}, ${activity.tipo}, ${activity.title}, ${description}, ${durationMinutes}, ${activity.durationSeconds || null},
         ${activity.distanceKm || null}, ${activity.avgHr || null}, ${activity.elevGainM || null},
         ${activity.sport}, 'completato', ${externalId}, ${provider})
      RETURNING *
    `;
  } catch (error) {
    // indice univoco (migrazione 20261128): la stessa attivita' e' stata salvata in parallelo da un'altra notifica
    if (!/duplicate key|unique/i.test(String(error?.message))) throw error;
    const row = (await sql`
      SELECT workout_id FROM calendar_workouts WHERE utenteid = ${utenteId} AND external_provider = ${provider} AND external_id = ${externalId} LIMIT 1
    `)[0];
    if (row && provider === 'garmin') {
      await updateExisting(sql, row.workout_id, utenteId, activity);
      return { workout: row, updated: true, day, description };
    }
    return { workout: row || {}, duplicate: true, day, description };
  }
  const workout = inserted[0];
  await sql`
    INSERT INTO workout_feedback (workout_id, utenteid, completato, durata_effettiva_minuti, note, updated_at)
    VALUES (${workout.workout_id}, ${utenteId}, 1, ${durationMinutes}, ${description}, NOW())
    ON CONFLICT (workout_id, utenteid) DO NOTHING
  `;
  await saveStreams(sql, workout.workout_id, utenteId, activity);

  await notifyCoach(sql, { utenteId, actor, provider, workout, day, description, verb: provider === 'garmin' ? 'sincronizzato' : 'caricato', title: activity.title });
  return { workout, created: true, day, description };
}

// il coach viene avvisato quando l'atleta carica (o l'orologio sincronizza) un'attivita'
async function notifyCoach(sql, { utenteId, actor, provider, workout, day, description, verb, title }) {
  if (actor && actor.ruolo !== 'cliente') return;
  const coachId = workout.coach_userid || await coachOf(sql, utenteId);
  if (!coachId) return;
  try {
    await notify(sql, coachId, {
      tipo: 'feedback',
      mittenteId: utenteId,
      titolo: `${await userName(sql, utenteId)} ha ${verb} "${title || workout.titolo}"${provider === 'garmin' && verb === 'completato' ? ' (Garmin)' : ''}`,
      messaggio: `${fmtDay(day)} · ${description.split('\n')[0]}`,
      link: { screen: 'WorkoutDetail', params: { workoutId: workout.workout_id, athleteId: utenteId } },
    });
  } catch (error) { console.error('notifica attivita', error?.message); }
}
