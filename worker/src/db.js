import { neon } from '@neondatabase/serverless';

// Thrown when no DB connection info is available. Callers (index.js onError)
// turn this into a clean 503 instead of a raw 500, mirroring the old
// Express backend's DB_ALLOW_START_WITHOUT_DB behaviour: the app still boots
// and responds, only DB-dependent routes fail until secrets are configured.
export class DbNotConfiguredError extends Error {
  constructor() {
    super('Database non configurato: imposta DATABASE_URL (o PGHOST/PGDATABASE/PGUSER/PGPASSWORD) con `wrangler secret put`.');
    this.name = 'DbNotConfiguredError';
    this.status = 503;
  }
}

// Builds a Postgres connection string the same way the old backend did,
// falling back to discrete PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGSSL vars
// when DATABASE_URL isn't set.
function resolveConnectionString(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT, PGSSL } = env;
  if (!PGHOST || !PGDATABASE || !PGUSER) return null;

  const port = PGPORT || '5432';
  const sslParam = (PGSSL || 'true').toLowerCase() === 'false' ? '' : '?sslmode=require';
  const auth = PGPASSWORD ? `${PGUSER}:${encodeURIComponent(PGPASSWORD)}` : PGUSER;
  return `postgresql://${auth}@${PGHOST}:${port}/${PGDATABASE}${sslParam}`;
}

export function isDbConfigured(env) {
  return !!resolveConnectionString(env);
}

// Returns a tagged-template SQL function bound to the request's env.
// Usage: const sql = db(c.env); const rows = await sql`SELECT * FROM utenti WHERE utenteid = ${id}`;
export function db(env) {
  const connectionString = resolveConnectionString(env);
  if (!connectionString) throw new DbNotConfiguredError();
  return neon(connectionString);
}
