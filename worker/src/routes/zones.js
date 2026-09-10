import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { assertAccessToAthlete, resolveTargetUserId } from '../utils.js';

const app = new Hono();
app.use('*', authenticate());

const BUILTIN_TESTS = [
  ['corsa', 'TEST_CORSA_6MIN', 'Test corsa 6 minuti', 'distance_m', 'Distanza (m)', 'TEST_CORSA_6MIN'],
  ['corsa', 'TEST_CORSA_5KM', 'Test corsa 5 km', 'time_mm_ss', 'Tempo (MM:SS)', 'TEST_CORSA_5KM'],
  ['corsa', 'TEST_CORSA_10KM', 'Test corsa 10 km', 'time_mm_ss', 'Tempo (MM:SS)', 'TEST_CORSA_10KM'],
  ['corsa', 'TEST_CORSA_THRESHOLD', 'Test corsa soglia', 'pace_mm_ss', 'Passo soglia (MM:SS/km)', 'TEST_CORSA_THRESHOLD'],
  ['corsa', 'TEST_CORSA_FC_MAX', 'Test corsa FC max', 'bpm_max', 'FC max (bpm)', 'TEST_CORSA_FC_MAX'],
  ['bike', 'TEST_BIKE_20MIN', 'Test bike 20 minuti', 'watt_avg', 'Potenza media (W)', 'TEST_BIKE_20MIN'],
  ['bike', 'TEST_BIKE_FC_MAX', 'Test bike FC max', 'bpm_max', 'FC max (bpm)', 'TEST_BIKE_FC_MAX'],
];

async function ensureBuiltinTests(sql) {
  for (const [sport, code, label, resultUnit, resultLabel, method] of BUILTIN_TESTS) {
    const existing = await sql`SELECT test_type_id FROM test_types WHERE code = ${code} LIMIT 1`;
    if (existing.length) continue;
    await sql`
      INSERT INTO test_types (sport, code, label, result_unit, result_label, zone_calc_method)
      VALUES (${sport}, ${code}, ${label}, ${resultUnit}, ${resultLabel}, ${method})
    `;
  }
}

function parseTime(value) {
  const parts = String(value || '').trim().split(':').map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  return Number(value);
}

function pace(secondsPerKm) {
  const total = Math.max(1, Math.round(secondsPerKm));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/km`;
}

function calculateZones(test, rawResult) {
  const value = test.result_unit === 'time_mm_ss' || test.result_unit === 'pace_mm_ss'
    ? parseTime(rawResult)
    : Number(rawResult);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Risultato numerico non valido');
  if (test.zone_calc_method === 'TEST_CORSA_FC_MAX' || test.zone_calc_method === 'TEST_BIKE_FC_MAX') {
    return { sport: test.sport, heartRate: [
      { key: 'Z1', name: 'Recupero', min: Math.round(value * 0.50), max: Math.round(value * 0.60), unit: 'bpm' },
      { key: 'Z2', name: 'Aerobico', min: Math.round(value * 0.60), max: Math.round(value * 0.70), unit: 'bpm' },
      { key: 'Z3', name: 'Medio', min: Math.round(value * 0.70), max: Math.round(value * 0.80), unit: 'bpm' },
      { key: 'Z4', name: 'Soglia', min: Math.round(value * 0.80), max: Math.round(value * 0.90), unit: 'bpm' },
      { key: 'Z5', name: 'VO2Max', min: Math.round(value * 0.90), max: Math.round(value * 0.95), unit: 'bpm' },
      { key: 'Z6', name: 'Anaerobico', min: Math.round(value * 0.95), max: value, unit: 'bpm' },
      { key: 'Z7', name: 'Neuromuscolare', min: value, max: Math.round(value * 1.05), unit: 'bpm' },
    ] };
  }
  if (test.sport === 'bike') {
    const ftp = value;
    return { sport: 'bike', power: [
      { key: 'Z1', name: 'Recupero', min: Math.round(ftp * 0.39), max: Math.round(ftp * 0.54), unit: 'W' },
      { key: 'Z2', name: 'Aerobico', min: Math.round(ftp * 0.54), max: Math.round(ftp * 0.74), unit: 'W' },
      { key: 'Z3', name: 'Medio', min: Math.round(ftp * 0.74), max: Math.round(ftp * 0.88), unit: 'W' },
      { key: 'Z4', name: 'Soglia', min: Math.round(ftp * 0.88), max: Math.round(ftp * 1.02), unit: 'W' },
      { key: 'Z5', name: 'VO2Max', min: Math.round(ftp * 1.02), max: Math.round(ftp * 1.16), unit: 'W' },
      { key: 'Z6', name: 'Anaerobico', min: Math.round(ftp * 1.16), max: Math.round(ftp * 1.45), unit: 'W' },
      { key: 'Z7', name: 'Sprint', min: Math.round(ftp * 1.45), max: Math.round(ftp * 3.88), unit: 'W' },
    ], ftp: Math.round(ftp) };
  }
  let thresholdPace;
  if (test.zone_calc_method === 'TEST_CORSA_6MIN') thresholdPace = 360000 / value;
  else if (test.zone_calc_method === 'TEST_CORSA_THRESHOLD') thresholdPace = parseTime(rawResult);
  else {
    const distance = test.zone_calc_method === 'TEST_CORSA_5KM' ? 5000 : 10000;
    thresholdPace = parseTime(rawResult) / (distance / 1000);
  }
  return { sport: 'corsa', pace: [
    { key: 'Z1', name: 'Recupero', min: pace(thresholdPace * 1.52), max: pace(thresholdPace * 1.36), unit: '/km' },
    { key: 'Z2', name: 'Aerobico', min: pace(thresholdPace * 1.36), max: pace(thresholdPace * 1.21), unit: '/km' },
    { key: 'Z3', name: 'Medio', min: pace(thresholdPace * 1.21), max: pace(thresholdPace * 1.12), unit: '/km' },
    { key: 'Z4', name: 'Soglia', min: pace(thresholdPace * 1.12), max: pace(thresholdPace * 1.03), unit: '/km' },
    { key: 'Z5', name: 'VO2Max', min: pace(thresholdPace * 1.03), max: pace(thresholdPace * 0.94), unit: '/km' },
    { key: 'Z6', name: 'Anaerobico', min: pace(thresholdPace * 0.94), max: pace(thresholdPace * 0.86), unit: '/km' },
    { key: 'Z7', name: 'Sprint', min: pace(thresholdPace * 0.86), max: pace(thresholdPace * 0.76), unit: '/km' },
  ], thresholdPace: pace(thresholdPace) };
}

app.get('/tests/types', async (c) => {
  const sql = db(c.env);
  await ensureBuiltinTests(sql);
  return c.json(await sql`SELECT * FROM test_types ORDER BY sport ASC, test_type_id ASC`);
});

app.get('/tests/results', async (c) => {
  const user = c.get('user');
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);
  const sql = db(c.env);
  if (!await assertAccessToAthlete(sql, user, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  await ensureBuiltinTests(sql);
  return c.json(await sql`SELECT * FROM (SELECT DISTINCT ON (r.test_type_id) r.*, t.sport, t.code, t.label, t.result_unit, t.result_label FROM athlete_test_results r JOIN test_types t ON t.test_type_id = r.test_type_id WHERE r.athlete_id = ${utenteId} ORDER BY r.test_type_id, r.test_date DESC, r.test_result_id DESC) latest ORDER BY test_date DESC, test_result_id DESC`);
});

app.post('/tests/results', async (c) => {
  const user = c.get('user');
  const { athleteId, testTypeId, testDate, rawResult, notes } = await c.req.json();
  const sql = db(c.env);
  const targetId = user.ruolo === 'cliente' ? user.userId : Number(athleteId);
  if (!targetId || !testTypeId || !rawResult || !testDate) return c.json({ message: 'test, data e risultato sono richiesti' }, 400);
  if (!await assertAccessToAthlete(sql, user, targetId)) return c.json({ message: 'Accesso negato' }, 403);
  const tests = await sql`SELECT * FROM test_types WHERE test_type_id = ${testTypeId}`;
  if (!tests[0]) return c.json({ message: 'Test non trovato' }, 404);
  let zones;
  try { zones = calculateZones(tests[0], rawResult); } catch (error) { return c.json({ message: error.message }, 400); }
  const previous = await sql`SELECT test_result_id FROM athlete_test_results WHERE athlete_id = ${targetId} AND test_type_id = ${testTypeId} ORDER BY test_date DESC, test_result_id DESC LIMIT 1`;
  const result = previous[0]
    ? await sql`UPDATE athlete_test_results SET test_date = ${testDate}, raw_result = ${String(rawResult)}, notes = ${notes || null}, computed_zones = ${JSON.stringify(zones)}::jsonb, is_active = true WHERE test_result_id = ${previous[0].test_result_id} RETURNING *`
    : await sql`INSERT INTO athlete_test_results (athlete_id, test_type_id, test_date, raw_result, notes, computed_zones, is_active) VALUES (${targetId}, ${testTypeId}, ${testDate}, ${String(rawResult)}, ${notes || null}, ${JSON.stringify(zones)}::jsonb, true) RETURNING *`;
  await sql`DELETE FROM athlete_test_results WHERE athlete_id = ${targetId} AND test_type_id = ${testTypeId} AND test_result_id <> ${result[0].test_result_id}`;
  await sql`DELETE FROM training_zone_sets WHERE athlete_id = ${targetId} AND sport = ${zones.sport}`;
  await sql`INSERT INTO training_zone_sets (athlete_id, sport, source_test_result_id, zones, efficiency_zones, is_active) VALUES (${targetId}, ${zones.sport}, ${result[0].test_result_id}, ${JSON.stringify(zones)}::jsonb, '{}'::jsonb, true)`;
  return c.json({ ...result[0], computed_zones: zones }, 201);
});

const DEFAULT_ZONES = {
  pace: [
    { key: 'Z1', name: 'Recupero', min: '', max: '', unit: '/km' },
    { key: 'Z2', name: 'Aerobico', min: '', max: '', unit: '/km' },
    { key: 'Z3', name: 'Medio', min: '', max: '', unit: '/km' },
    { key: 'Z4', name: 'Soglia', min: '', max: '', unit: '/km' },
    { key: 'Z5', name: 'VO2Max', min: '', max: '', unit: '/km' },
    { key: 'Z6', name: 'Anaerobico', min: '', max: '', unit: '/km' },
    { key: 'Z7', name: 'Neuromuscolare', min: '', max: '', unit: '/km' },
  ],
  power: [
    { key: 'LT1', name: 'LT1', min: '', max: '', unit: 'W' },
    { key: 'LT2', name: 'LT2', min: '', max: '', unit: 'W' },
    { key: 'FM', name: 'Fat Max', min: '', max: '', unit: 'W' },
    { key: 'SS', name: 'Sweet Spot', min: '', max: '', unit: 'W' },
    { key: 'FTP', name: 'FTP', min: '', max: '', unit: 'W' },
    { key: 'VO2Max', name: 'VO2Max', min: '', max: '', unit: 'W' },
    { key: 'Z6', name: 'Anaerobico', min: '', max: '', unit: 'W' },
    { key: 'Z7', name: 'Neuromuscolare', min: '', max: '', unit: 'W' },
  ],
  heartRate: [
    { key: 'Z1', name: 'Recupero', min: '', max: '', unit: 'bpm' },
    { key: 'Z2', name: 'Aerobico', min: '', max: '', unit: 'bpm' },
    { key: 'Z3', name: 'Medio', min: '', max: '', unit: 'bpm' },
    { key: 'Z4', name: 'Soglia', min: '', max: '', unit: 'bpm' },
    { key: 'Z5', name: 'VO2Max', min: '', max: '', unit: 'bpm' },
    { key: 'Z6', name: 'Anaerobico', min: '', max: '', unit: 'bpm' },
    { key: 'Z7', name: 'Neuromuscolare', min: '', max: '', unit: 'bpm' },
  ],
};

app.get('/', async (c) => {
  const user = c.get('user');
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);
  const sql = db(c.env);
  if (!await assertAccessToAthlete(sql, user, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  const rows = await sql`SELECT * FROM training_zone_sets WHERE athlete_id = ${utenteId} AND is_active = true LIMIT 1`;
  return c.json(rows[0] || { athlete_id: utenteId, zones: DEFAULT_ZONES });
});

app.put('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { athleteId, zones } = await c.req.json();
  if (!athleteId || !zones) return c.json({ message: 'athleteId e zones richiesti' }, 400);
  const sql = db(c.env);
  if (!await assertAccessToAthlete(sql, user.userId, Number(athleteId))) return c.json({ message: 'Accesso negato' }, 403);
  await sql`DELETE FROM training_zone_sets WHERE athlete_id = ${athleteId}`;
  const rows = await sql`
    INSERT INTO training_zone_sets (athlete_id, is_active, zones)
    VALUES (${athleteId}, true, ${JSON.stringify(zones)}::jsonb)
    RETURNING *
  `;
  return c.json(rows[0]);
});

export default app;