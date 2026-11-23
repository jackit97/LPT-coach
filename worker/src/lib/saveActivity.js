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

/**
 * Salva un'attivita' svolta nel calendario dell'atleta.
 * provider 'file': un doppione restituisce { duplicate: true }.
 * provider 'garmin': se l'attivita' c'e' gia' (es. arrivato prima il riepilogo e poi il file) viene aggiornata;
 * se era gia' stata importata da file o da Strava non viene ricreata.
 */
export async function saveImportedActivity(sql, { utenteId, activity, provider = 'file', actor = null, timeZone = 'Europe/Rome' }) {
  const day = localDay(activity, timeZone);
  const externalId = activityExternalId(activity);
  const durationMinutes = Math.round((activity.durationSeconds || 0) / 60);
  const description = describeActivity(activity, provider);

  if (provider === 'garmin') {
    const sameGarmin = await sql`
      SELECT workout_id FROM calendar_workouts
      WHERE utenteid = ${utenteId} AND external_provider = 'garmin' AND external_id = ${externalId} LIMIT 1
    `;
    if (sameGarmin.length) {
      const workoutId = sameGarmin[0].workout_id;
      await sql`
        UPDATE calendar_workouts SET durata_minuti = ${durationMinutes}, durata_secondi = ${activity.durationSeconds || null},
          distance_km = COALESCE(${activity.distanceKm || null}, distance_km), avg_hr = COALESCE(${activity.avgHr || null}, avg_hr),
          elev_gain_m = COALESCE(${activity.elevGainM || null}, elev_gain_m), updated_at = NOW()
        WHERE workout_id = ${workoutId}
      `;
      await saveStreams(sql, workoutId, utenteId, activity);
      return { workout: { workout_id: workoutId }, updated: true, day, description };
    }
    // gia' arrivata da un altro canale (file caricato a mano o Strava): stesso giorno, sport e durata (+/- 90 s)
    const other = await sql`
      SELECT workout_id FROM calendar_workouts
      WHERE utenteid = ${utenteId} AND data = ${day} AND external_provider IS NOT NULL AND external_provider <> 'garmin'
        AND (external_id = ${externalId}
             OR (COALESCE(sport, tipo) = ${activity.sport || activity.tipo} AND ABS(COALESCE(durata_secondi, 0) - ${activity.durationSeconds || 0}) <= 90))
      LIMIT 1
    `;
    if (other.length) return { workout: other[0], duplicate: true, day, description };
  } else {
    const existing = await sql`
      SELECT workout_id FROM calendar_workouts
      WHERE utenteid = ${utenteId} AND external_provider = ${provider} AND external_id = ${externalId} LIMIT 1
    `;
    if (existing.length) return { workout: existing[0], duplicate: true, day, description };
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
  const inserted = await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, distance_km, avg_hr, elev_gain_m,
       sport, stato, external_id, external_provider)
    VALUES
      (${utenteId}, ${coachId}, ${day}, ${activity.tipo}, ${activity.title}, ${description}, ${durationMinutes}, ${activity.durationSeconds || null},
       ${activity.distanceKm || null}, ${activity.avgHr || null}, ${activity.elevGainM || null},
       ${activity.sport}, 'completato', ${externalId}, ${provider})
    RETURNING *
  `;
  const workout = inserted[0];
  await sql`
    INSERT INTO workout_feedback (workout_id, utenteid, completato, durata_effettiva_minuti, note, updated_at)
    VALUES (${workout.workout_id}, ${utenteId}, 1, ${durationMinutes}, ${description}, NOW())
    ON CONFLICT (workout_id, utenteid) DO NOTHING
  `;
  await saveStreams(sql, workout.workout_id, utenteId, activity);

  // il coach viene avvisato quando l'atleta carica (o l'orologio sincronizza) un'attivita'
  const byAthlete = !actor || actor.ruolo === 'cliente';
  if (byAthlete && coachId) {
    try {
      await notify(sql, coachId, {
        tipo: 'feedback',
        mittenteId: utenteId,
        titolo: `${await userName(sql, utenteId)} ha ${provider === 'garmin' ? 'sincronizzato' : 'caricato'} "${activity.title}"`,
        messaggio: `${fmtDay(day)} · ${description.split('\n')[0]}`,
        link: { screen: 'WorkoutDetail', params: { workoutId: workout.workout_id, athleteId: utenteId } },
      });
    } catch (error) { console.error('notifica attivita', error?.message); }
  }
  return { workout, created: true, day, description };
}
