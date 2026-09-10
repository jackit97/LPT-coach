const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL mancante');

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

(async () => {
  await pool.query('BEGIN');

  await pool.query(`
    INSERT INTO lptapp.calendar_workouts
      (utenteid, coach_userid, schedaid, data, tipo, titolo, descrizione, stato)
    SELECT s.utenteid, NULL, s.schedaid, s.datainizio, 'forza',
           COALESCE(NULLIF(TRIM(s.nomescheda), ''), 'Allenamento pesi'),
           s.notegenerali, 'pianificato'
    FROM lptapp.schedeallenamento s
    WHERE s.datainizio IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM lptapp.calendar_workouts w
        WHERE w.schedaid = s.schedaid AND w.data = s.datainizio
      )
  `);

  await pool.query(`
    INSERT INTO lptapp.calendar_workout_exercises
      (workout_id, nome, serie, ripetizioni, note, video_url, recupero, order_index)
    SELECT w.workout_id, e.nomeesercizio, e.serie, e.ripetizioni, e.noteutente, e.videourl,
           e.recupero, ROW_NUMBER() OVER (PARTITION BY w.workout_id ORDER BY e.esercizioid) - 1
    FROM lptapp.calendar_workouts w
    JOIN lptapp.esercizischeda e ON e.schedaid = w.schedaid
    WHERE w.tipo = 'forza'
      AND NOT EXISTS (
        SELECT 1 FROM lptapp.calendar_workout_exercises x
        WHERE x.workout_id = w.workout_id
      )
  `);

  await pool.query(`
    UPDATE lptapp.calendar_workout_exercises x
    SET note = COALESCE(NULLIF(x.note, ''), NULLIF(e.descrizione, ''), NULLIF(e.noteutente, '')),
        video_url = COALESCE(x.video_url, e.videourl),
        recupero = COALESCE(x.recupero, e.recupero)
    FROM lptapp.calendar_workouts w, lptapp.esercizischeda e
    WHERE x.workout_id = w.workout_id AND w.schedaid = e.schedaid
      AND e.nomeesercizio = x.nome AND w.tipo = 'forza'
  `);

  await pool.query(`
    INSERT INTO lptapp.calendar_workouts
      (utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione, durata_minuti, rpe_pianificato, stato)
    SELECT p.user_id, NULL, s.session_id,
           COALESCE(
             s."date"::date,
             p.start_date::date + ((ROW_NUMBER() OVER (PARTITION BY p.plan_id ORDER BY s.session_id) - 1) * 7)::int
           ),
           'endurance', s.title, s.description, s.duration_minutes, s.rpe_target, 'pianificato'
    FROM lptapp.endurance_sessions s
    JOIN lptapp.endurance_plans p ON p.plan_id = s.plan_id
    WHERE NOT EXISTS (
      SELECT 1 FROM lptapp.calendar_workouts w WHERE w.endurance_session_id = s.session_id
    )
  `);

  const counts = await pool.query(`
    SELECT tipo, COUNT(*)::int AS count
    FROM lptapp.calendar_workouts
    GROUP BY tipo
    ORDER BY tipo
  `);
  await pool.query('COMMIT');
  console.log(JSON.stringify(counts.rows, null, 2));
  await pool.end();
})().catch(async (error) => {
  await pool.query('ROLLBACK').catch(() => {});
  console.error(error.message || error);
  await pool.end().catch(() => {});
  process.exit(1);
});