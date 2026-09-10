/* Recalculate historical test zones using the LPT CoachPeaking reference bands. */
const { Client } = require('../worker/node_modules/pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL before running this script.');

const zonesFor = (test, rawResult) => {
  const raw = String(rawResult || '').trim();
  const parseTime = (value) => {
    const parts = value.split(':').map(Number);
    return parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : Number(value);
  };
  const value = test.result_unit === 'time_mm_ss' || test.result_unit === 'pace_mm_ss' ? parseTime(raw) : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Risultato non valido: ${raw}`);
  if (test.zone_calc_method === 'TEST_CORSA_FC_MAX' || test.zone_calc_method === 'TEST_BIKE_FC_MAX') {
    const bands = [[0.50, 0.60], [0.60, 0.70], [0.70, 0.80], [0.80, 0.90], [0.90, 0.95], [0.95, 1.00], [1.00, 1.05]];
    const names = ['Recupero', 'Aerobico', 'Medio', 'Soglia', 'VO2Max', 'Anaerobico', 'Neuromuscolare'];
    return { sport: test.sport, heartRate: bands.map(([min, max], index) => ({ key: `Z${index + 1}`, name: names[index], min: Math.round(value * min), max: Math.round(value * max), unit: 'bpm' })) };
  }
  const roundPace = (seconds) => {
    const total = Math.max(1, Math.round(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/km`;
  };

  if (test.sport === 'bike') {
    const bands = [[0.39, 0.54], [0.54, 0.74], [0.74, 0.88], [0.88, 1.02], [1.02, 1.16], [1.16, 1.45], [1.45, 3.88]];
    const names = ['Recupero', 'Aerobico', 'Medio', 'Soglia', 'VO2Max', 'Anaerobico', 'Sprint'];
    return { sport: 'bike', power: bands.map(([min, max], index) => ({ key: `Z${index + 1}`, name: names[index], min: Math.round(value * min), max: Math.round(value * max), unit: 'W' })) };
  }

  let basePace;
  if (test.zone_calc_method === 'TEST_CORSA_6MIN') basePace = 360000 / value;
  else if (test.zone_calc_method === 'TEST_CORSA_THRESHOLD') basePace = parseTime(raw);
  else basePace = parseTime(raw) / (test.zone_calc_method === 'TEST_CORSA_5KM' ? 5 : 10);
  const bands = [[1.52, 1.36], [1.36, 1.21], [1.21, 1.12], [1.12, 1.03], [1.03, 0.94], [0.94, 0.86], [0.86, 0.76]];
  const names = ['Recupero', 'Aerobico', 'Medio', 'Soglia', 'VO2Max', 'Anaerobico', 'Sprint'];
  return { sport: 'corsa', pace: bands.map(([min, max], index) => ({ key: `Z${index + 1}`, name: names[index], min: roundPace(basePace * min), max: roundPace(basePace * max), unit: '/km' })) };
};

(async () => {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT r.test_result_id, r.athlete_id, r.raw_result, t.*
      FROM lptapp.athlete_test_results r
      JOIN lptapp.test_types t ON t.test_type_id = r.test_type_id
      ORDER BY r.athlete_id, r.test_result_id
    `);
    const latestBySport = new Map();
    for (const row of rows) {
      if (!['corsa', 'bike'].includes(row.sport)) continue;
      const zones = zonesFor(row, row.raw_result);
      await client.query('UPDATE lptapp.athlete_test_results SET computed_zones = $1::jsonb WHERE test_result_id = $2', [JSON.stringify(zones), row.test_result_id]);
      latestBySport.set(`${row.athlete_id}:${row.sport}`, { athleteId: row.athlete_id, sport: row.sport, resultId: row.test_result_id, zones });
    }
    for (const item of latestBySport.values()) {
      await client.query('DELETE FROM lptapp.training_zone_sets WHERE athlete_id = $1 AND sport = $2', [item.athleteId, item.sport]);
      await client.query(`INSERT INTO lptapp.training_zone_sets (athlete_id, sport, source_test_result_id, zones, efficiency_zones, is_active) VALUES ($1, $2, $3, $4::jsonb, '{}'::jsonb, true)`, [item.athleteId, item.sport, item.resultId, JSON.stringify(item.zones)]);
    }
    await client.query('COMMIT');
    console.log(`Updated ${rows.length} test results and ${latestBySport.size} active zone sets.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(error.message || error); process.exit(1); });
