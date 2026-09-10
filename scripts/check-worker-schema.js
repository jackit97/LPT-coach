const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
const workerUrl = process.env.WORKER_URL || 'https://lpt-worker.gc-jack1997.workers.dev';

if (!databaseUrl) {
  console.error('DATABASE_URL mancante.');
  process.exit(1);
}

const email = `schema.probe+${Date.now()}@lptcoach.local`;
const password = 'Probe1234!';
const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

(async () => {
  const response = await fetch(`${workerUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nome: 'Schema Probe', email, password, ruolo: 'cliente' })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Register probe failed: ${response.status} ${body}`);
  }

  const loginResponse = await fetch(`${workerUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!loginResponse.ok) {
    const loginBody = await loginResponse.text();
    throw new Error(`Login probe failed: ${loginResponse.status} ${loginBody}`);
  }

  const counts = await pool.query(`
    select
      (select count(*)::int from lptapp.utenti where email = $1) as lptapp_count,
      (select count(*)::int from public.utenti where email = $1) as public_count
  `, [email]);

  await pool.query('delete from lptapp.utenti where email = $1', [email]).catch(() => {});
  await pool.query('delete from public.utenti where email = $1', [email]).catch(() => {});
  await pool.end();

  console.log(JSON.stringify({ ...counts.rows[0], login_ok: true }, null, 2));
})().catch(async (err) => {
  console.error(err.message || err);
  await pool.end().catch(() => {});
  process.exit(1);
});