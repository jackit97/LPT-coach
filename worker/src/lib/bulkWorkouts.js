// Inserimento di molti allenamenti con pochissime query.
// Su Cloudflare Workers (piano gratuito) ogni query a Neon e' una "subrequest" e ce ne sono al massimo 50
// per richiesta: assegnare un piano di 16 allenamenti con una query per allenamento e una per esercizio
// superava il limite ("Too many subrequests"). Qui: 1 query per gli id, 1 per le sessioni endurance,
// 1 per gli allenamenti e 1 per tutti gli esercizi, qualunque sia il numero di allenamenti.

const int = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(String(value).replace(',', '.')));
  return Number.isFinite(n) ? n : null;
};
const text = (value, max) => (value === null || value === undefined || String(value).trim() === '' ? null : String(value).slice(0, max));

// items: [{ utenteId, coachId, data, tipo, titolo, descrizione, durataMinuti, durataSecondi, rpe, colore, sport,
//           stato, schedaid, esercizi: [{ nome, serie, ripetizioni, carico, recupero, note, video_url }], endurance }]
// Restituisce le righe di calendar_workouts create, nello stesso ordine di items.
export async function insertWorkoutsBulk(sql, items) {
  if (!items.length) return [];

  // piano endurance attivo di ogni atleta (le sessioni endurance ne hanno bisogno)
  const planOf = new Map();
  const enduranceAthletes = [...new Set(items.filter((item) => item.endurance).map((item) => Number(item.utenteId)))];
  if (enduranceAthletes.length) {
    const rows = await sql`
      SELECT DISTINCT ON (user_id) user_id, plan_id FROM endurance_plans
      WHERE user_id = ANY(${enduranceAthletes}) AND is_active = 1 ORDER BY user_id, plan_id DESC
    `;
    rows.forEach((row) => planOf.set(Number(row.user_id), row.plan_id));
    for (const athleteId of enduranceAthletes) {
      if (planOf.has(athleteId)) continue;
      const day = items.find((item) => Number(item.utenteId) === athleteId).data;
      const created = await sql`
        INSERT INTO endurance_plans (user_id, title, block, start_date, end_date, weeks, is_active)
        VALUES (${athleteId}, 'Allenamenti endurance', 'workout', ${day}, ${day}, 1, 1) RETURNING plan_id
      `;
      planOf.set(athleteId, created[0].plan_id);
    }
  }

  // id riservati in anticipo: cosi' allenamenti, sessioni ed esercizi si collegano senza query intermedie
  const sessionCount = items.filter((item) => item.endurance).length;
  const reserved = (await sql`
    SELECT
      (SELECT array_agg(nextval(pg_get_serial_sequence(${sql.table('calendar_workouts')}::text, 'workout_id')))
         FROM generate_series(1, ${items.length}::int)) AS workouts,
      (SELECT array_agg(nextval(pg_get_serial_sequence(${sql.table('endurance_sessions')}::text, 'session_id')))
         FROM generate_series(1, ${sessionCount}::int)) AS sessions
  `)[0];
  const workoutIds = (reserved.workouts || []).map(Number);
  const sessionIds = (reserved.sessions || []).map(Number);

  const sessions = [];
  const workouts = [];
  const exercises = [];
  let nextSession = 0;
  items.forEach((item, index) => {
    const workoutId = workoutIds[index];
    const sport = item.endurance?.sport || item.sport || null;
    let sessionId = null;
    if (item.endurance) {
      const e = item.endurance;
      sessionId = sessionIds[nextSession];
      nextSession += 1;
      sessions.push({
        session_id: sessionId, plan_id: planOf.get(Number(item.utenteId)), date: item.data, title: text(item.titolo, 200) || 'Allenamento',
        zone: text(e.zone, 10), duration_minutes: int(e.duration_minutes) || int(item.durataMinuti) || 0, duration_seconds: int(e.duration_seconds),
        target: text(e.target, 100), description: e.description || null, rpe_target: int(e.rpe_target),
        steps_text: e.steps_text || null, steps_json: e.steps_json ? (typeof e.steps_json === 'string' ? e.steps_json : JSON.stringify(e.steps_json)) : null,
        sport: text(sport, 20), elevation_m: int(e.elevation_m), video_urls_json: e.video_urls_json || null,
      });
    }
    const minutes = int(item.durataMinuti);
    workouts.push({
      workout_id: workoutId, utenteid: Number(item.utenteId), coach_userid: item.coachId || null, endurance_session_id: sessionId,
      data: item.data, tipo: item.tipo || 'forza', titolo: text(item.titolo, 200) || 'Allenamento', descrizione: item.descrizione || null,
      durata_minuti: minutes, durata_secondi: int(item.durataSecondi) || (minutes ? minutes * 60 : null),
      rpe_pianificato: int(item.rpe ?? item.endurance?.rpe_target), colore: text(item.colore, 20), sport: text(sport, 20),
      stato: item.stato || 'pianificato', schedaid: item.schedaid || null,
    });
    (item.esercizi || []).forEach((ex, position) => {
      if (!String(ex?.nome || '').trim()) return;
      exercises.push({
        workout_id: workoutId, nome: text(ex.nome, 150), serie: int(ex.serie), ripetizioni: text(ex.ripetizioni, 50), carico: text(ex.carico, 50),
        recupero: text(ex.recupero, 50), note: ex.note || null, video_url: text(ex.video_url || ex.videoUrl, 255), order_index: position,
      });
    });
  });

  if (sessions.length) {
    await sql`
      INSERT INTO endurance_sessions (session_id, plan_id, "date", title, zone, duration_minutes, duration_seconds, target, description,
                                      rpe_target, steps_text, steps_json, sport, elevation_m, video_urls_json)
      SELECT session_id, plan_id, "date", title, zone, duration_minutes, duration_seconds, target, description,
             rpe_target, steps_text, steps_json, sport, elevation_m, video_urls_json
      FROM jsonb_to_recordset(${JSON.stringify(sessions)}::jsonb) AS x(session_id int, plan_id int, "date" date, title text, zone text,
        duration_minutes int, duration_seconds int, target text, description text, rpe_target int, steps_text text, steps_json text,
        sport text, elevation_m int, video_urls_json text)
    `;
  }
  const inserted = await sql`
    INSERT INTO calendar_workouts (workout_id, utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione,
                                   durata_minuti, durata_secondi, rpe_pianificato, colore, sport, stato, schedaid)
    SELECT workout_id, utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione,
           durata_minuti, durata_secondi, rpe_pianificato, colore, sport, stato, schedaid
    FROM jsonb_to_recordset(${JSON.stringify(workouts)}::jsonb) AS x(workout_id int, utenteid int, coach_userid int, endurance_session_id int,
      data date, tipo text, titolo text, descrizione text, durata_minuti int, durata_secondi int, rpe_pianificato int, colore text,
      sport text, stato text, schedaid int)
    RETURNING *
  `;
  if (exercises.length) {
    await sql`
      INSERT INTO calendar_workout_exercises (workout_id, nome, serie, ripetizioni, carico, recupero, note, video_url, order_index)
      SELECT workout_id, nome, serie, ripetizioni, carico, recupero, note, video_url, order_index
      FROM jsonb_to_recordset(${JSON.stringify(exercises)}::jsonb) AS x(workout_id int, nome text, serie int, ripetizioni text,
        carico text, recupero text, note text, video_url text, order_index int)
    `;
  }
  const byId = new Map(inserted.map((row) => [Number(row.workout_id), row]));
  return workoutIds.map((id) => byId.get(id)).filter(Boolean);
}
