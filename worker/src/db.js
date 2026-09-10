import { neon } from '@neondatabase/serverless';

const TABLE_NAMES = [
  'athlete_test_results',
  'calendar_workout_exercises',
  'calendar_workouts',
  'diete',
  'endurance_activities',
  'endurance_checkins',
  'endurance_goals',
  'endurance_integrations',
  'endurance_metrics_weekly',
  'endurance_notifications',
  'endurance_plan_template_sessions',
  'endurance_plan_templates',
  'endurance_plans',
  'endurance_sessions',
  'endurance_zones',
  'esercizifull',
  'esercizischeda',
  'food_and_nutritional_value',
  'foodcompositionraw',
  'pagamenti',
  'pastidieta',
  'profiloutente',
  'pt_clienti',
  'schedeallenamento',
  'training_zone_sets',
  'test_types',
  'utenti',
  'videotutorial',
  'workout_feedback',
  'workouttemplateexercises',
  'workouttemplates',
];

const TABLE_PATTERN = TABLE_NAMES.sort((left, right) => right.length - left.length).join('|');

function resolveSchema(env) {
  const rawSchema = (env.DB_SCHEMA || 'public').trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawSchema) ? rawSchema : 'public';
}

function qualifySqlText(text, schema) {
  if (schema === 'public') return text;
  return text.replace(
    new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+(${TABLE_PATTERN})\\b`, 'gi'),
    (_match, keyword, tableName) => `${keyword} ${schema}.${tableName}`
  );
}

function withSchema(sql, schema) {
  return (strings, ...values) => {
    const qualifiedStrings = Array.from(strings, (part) => qualifySqlText(part, schema));
    Object.defineProperty(qualifiedStrings, 'raw', {
      value: Array.from(strings.raw, (part) => qualifySqlText(part, schema)),
    });
    return sql(qualifiedStrings, ...values);
  };
}

let pgPoolPromise;

async function getPgPool(connectionString) {
  if (!pgPoolPromise) {
    pgPoolPromise = import('pg').then(({ Pool }) => new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    }));
  }
  return pgPoolPromise;
}

function pgSql(connectionString, schema) {
  return async (strings, ...values) => {
    const qualifiedStrings = Array.from(strings, (part) => qualifySqlText(part, schema));
    const text = qualifiedStrings.reduce((query, part, index) => {
      return `${query}${part}${index < values.length ? `$${index + 1}` : ''}`;
    }, '');

    const pool = await getPgPool(connectionString);
    const result = await pool.query(text, values);
    return result.rows;
  };
}

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
  const withSchemaSearchPath = (connectionString) => {
    const schema = resolveSchema(env);
    if (schema === 'public') return connectionString;

    const url = new URL(connectionString);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    return url.toString();
  };

  if (env.DATABASE_URL) return withSchemaSearchPath(env.DATABASE_URL);

  const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT, PGSSL } = env;
  if (!PGHOST || !PGDATABASE || !PGUSER) return null;

  const port = PGPORT || '5432';
  const sslParam = (PGSSL || 'true').toLowerCase() === 'false' ? '' : '?sslmode=require';
  const auth = PGPASSWORD ? `${PGUSER}:${encodeURIComponent(PGPASSWORD)}` : PGUSER;
  return withSchemaSearchPath(`postgresql://${auth}@${PGHOST}:${port}/${PGDATABASE}${sslParam}`);
}

export function isDbConfigured(env) {
  return !!resolveConnectionString(env);
}

// Returns a tagged-template SQL function bound to the request's env.
// Usage: const sql = db(c.env); const rows = await sql`SELECT * FROM utenti WHERE utenteid = ${id}`;
export function db(env) {
  const connectionString = resolveConnectionString(env);
  if (!connectionString) throw new DbNotConfiguredError();
  const schema = resolveSchema(env);
  const host = new URL(connectionString).hostname;
  if (host.endsWith('.neon.tech')) return withSchema(neon(connectionString), schema);
  return pgSql(connectionString, schema);
}
