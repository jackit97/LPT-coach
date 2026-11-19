import { computeWorkoutLoad, buildLoadSeries, weeklySummary, todayIso, addDaysIso, isoDay, CHRONIC_DAYS } from './trainingLoad.js';

const ZONE_GROUPS = ['pace', 'power', 'heartRate', 'swimPace'];

function parseZones(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

// Le zone possono arrivare da piu' set (uno per sport/test). Le unisce in un unico documento
// { pace, power, heartRate, swimPace }: per ogni gruppo vince il set aggiornato piu' di recente.
export async function loadMergedZones(sql, athleteId) {
  const rows = await sql`
    SELECT zones, updated_at, zone_set_id FROM training_zone_sets
    WHERE athlete_id = ${athleteId} AND is_active = true
    ORDER BY updated_at ASC NULLS FIRST, zone_set_id ASC
  `;
  const merged = {};
  for (const row of rows) {
    const zones = parseZones(row.zones);
    for (const group of ZONE_GROUPS) {
      if (Array.isArray(zones[group]) && zones[group].some((zone) => String(zone.min ?? '').trim() !== '' || String(zone.max ?? '').trim() !== '')) {
        merged[group] = zones[group];
      }
    }
    for (const extra of ['ftp', 'thresholdPace', 'css', 'hrMax']) if (zones[extra]) merged[extra] = zones[extra];
  }
  return merged;
}

// Salva il documento unificato come unico set attivo dell'atleta.
export async function saveMergedZones(sql, athleteId, zones, sourceTestResultId = null) {
  await sql`DELETE FROM training_zone_sets WHERE athlete_id = ${athleteId}`;
  const rows = await sql`
    INSERT INTO training_zone_sets (athlete_id, sport, source_test_result_id, is_active, zones, efficiency_zones, updated_at)
    VALUES (${athleteId}, 'multi', ${sourceTestResultId}, true, ${JSON.stringify(zones)}::jsonb, '{}'::jsonb, NOW())
    RETURNING *
  `;
  return rows[0];
}

// Workout del calendario (con sessione endurance e feedback) arricchiti con il calcolo del carico.
export async function loadWorkoutsWithLoad(sql, athleteId, from, to, hrZones = null) {
  const zones = hrZones ? { heartRate: hrZones } : await loadMergedZones(sql, athleteId);
  let rows;
  try {
    rows = await sql`
      SELECT w.*, f.completato, f.rpe AS feedback_rpe, f.sensazione, f.durata_effettiva_minuti, f.note AS feedback_note,
             f.updated_at AS feedback_updated_at,
             s.steps_json AS session_steps_json, s.sport AS session_sport,
             st.zone_seconds_json AS stream_zone_seconds
      FROM calendar_workouts w
      LEFT JOIN workout_feedback f ON f.workout_id = w.workout_id AND f.utenteid = w.utenteid
      LEFT JOIN endurance_sessions s ON s.session_id = w.endurance_session_id
      LEFT JOIN activity_streams st ON st.workout_id = w.workout_id
      WHERE w.utenteid = ${athleteId} AND w.data BETWEEN ${from} AND ${to}
      ORDER BY w.data ASC, w.order_index ASC, w.workout_id ASC
    `;
  } catch (error) {
    // migrazione 20261120 (activity_streams) non ancora applicata: stesso calcolo senza i campioni
    if (!/activity_streams/.test(String(error?.message))) throw error;
    rows = await sql`
      SELECT w.*, f.completato, f.rpe AS feedback_rpe, f.sensazione, f.durata_effettiva_minuti, f.note AS feedback_note,
             f.updated_at AS feedback_updated_at,
             s.steps_json AS session_steps_json, s.sport AS session_sport
      FROM calendar_workouts w
      LEFT JOIN workout_feedback f ON f.workout_id = w.workout_id AND f.utenteid = w.utenteid
      LEFT JOIN endurance_sessions s ON s.session_id = w.endurance_session_id
      WHERE w.utenteid = ${athleteId} AND w.data BETWEEN ${from} AND ${to}
      ORDER BY w.data ASC, w.order_index ASC, w.workout_id ASC
    `;
  }
  return rows.map((row) => {
    const { session_steps_json: stepsJson, session_sport: sessionSport, stream_zone_seconds: streamZones, ...workout } = row;
    if (streamZones) { try { workout.secondi_zona_fc = JSON.parse(streamZones); } catch { /* ignora */ } }
    const load = computeWorkoutLoad(workout, {
      session: stepsJson || sessionSport ? { steps_json: stepsJson, sport: sessionSport } : null,
      hrZones: zones.heartRate || [],
    });
    return { ...workout, sport: workout.sport || sessionSport || null, load };
  });
}

// Serie carico acuto/cronico/performance + riepilogo settimanale per un intervallo.
export async function loadAthleteLoad(sql, athleteId, from, to) {
  const today = todayIso();
  const historyFrom = addDaysIso(from, -CHRONIC_DAYS * 3);
  const workouts = await loadWorkoutsWithLoad(sql, athleteId, historyFrom, to);
  const series = buildLoadSeries(workouts, { from, to, today });
  const inRange = workouts.filter((workout) => isoDay(workout.data) >= from);
  const current = [...series].reverse().find((point) => !point.proiezione) || series[series.length - 1] || null;
  return { today, series, weeks: weeklySummary(inRange), current };
}
