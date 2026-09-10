const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL mancante');

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

(async () => {
  const queries = {
    users: `select utenteid, email, ruolo from lptapp.utenti order by utenteid`,
    plans: `select plan_id, user_id, title, start_date, end_date from lptapp.endurance_plans order by plan_id`,
    sessions: `select session_id, plan_id, "date", title, duration_minutes from lptapp.endurance_sessions order by session_id`,
    calendar: `select workout_id, utenteid, coach_userid, endurance_session_id, data, tipo, titolo from lptapp.calendar_workouts order by workout_id`,
    sheets: `select schedaid, utenteid, nomescheda, datainizio, datafine, attiva from lptapp.schedeallenamento order by schedaid`,
    exercises: `select esercizioid, schedaid, nomeesercizio, serie, ripetizioni from lptapp.esercizischeda order by esercizioid`
  };
  const output = {};
  for (const [name, query] of Object.entries(queries)) {
    const result = await pool.query(query);
    output[name] = result.rows;
  }
  console.log(JSON.stringify(output, null, 2));
  await pool.end();
})().catch(async (error) => {
  console.error(error.message || error);
  await pool.end().catch(() => {});
  process.exit(1);
});