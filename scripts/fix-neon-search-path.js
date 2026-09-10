const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL mancante. Impostala come variabile temporanea prima di eseguire lo script.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await pool.query('ALTER ROLE neondb_owner IN DATABASE neondb SET search_path TO lptapp, public');
  await pool.query("delete from public.utenti where email like 'schema.probe+%@lptcoach.local'").catch(() => {});

  const result = await pool.query(`
    select
      current_database() as database,
      current_user as user_name,
      current_setting('search_path') as current_search_path,
      (select count(*)::int from lptapp.utenti) as lptapp_users,
      (select count(*)::int from public.utenti) as public_users
  `);
  console.log(JSON.stringify(result.rows[0], null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err.message || err);
  await pool.end().catch(() => {});
  process.exit(1);
});