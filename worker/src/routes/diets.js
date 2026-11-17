import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete } from '../utils.js';
import { notify, fmtDay } from '../lib/notify.js';

const app = new Hono();
app.use('*', authenticate());

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const number = Number.parseFloat(String(value).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(number) ? number : null;
};

// Normalizza un alimento: valori numerici per 100 g e kcal coerenti con i macro.
function normalizeFood(row, source) {
  const proteins = toNumber(row.proteins);
  const carbs = toNumber(row.carbs);
  const fat = toNumber(row.fat);
  const fiber = toNumber(row.fiber);
  let kcal = toNumber(row.kcal);
  let kcalCalcolate = false;
  const estimate = (proteins || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9 + (fiber || 0) * 2;
  if ((!kcal || kcal <= 0) && estimate > 0) {
    kcal = estimate;
    kcalCalcolate = true;
  } else if (kcal && estimate > 20 && kcal / estimate > 3.6 && kcal / estimate < 4.8) {
    // valore probabilmente in kJ invece che kcal
    kcal /= 4.184;
    kcalCalcolate = true;
  }
  return {
    code: `${source}:${row.code}`,
    source,
    product_name: String(row.product_name || '').trim(),
    brands: row.brands ? String(row.brands).trim() : null,
    energy_kcal_100g: kcal !== null ? Math.round(kcal) : null,
    proteins_100g: proteins,
    carbohydrates_100g: carbs,
    fat_100g: fat,
    sugars_100g: toNumber(row.sugars),
    fiber_100g: fiber,
    kcal_calcolate: kcalCalcolate,
  };
}

// GET /diets/foods/search?q= - cerca prima negli alimenti generici (tabella CREA) e poi nei prodotti confezionati.
app.get('/foods/search', async (c) => {
  const query = (c.req.query('q') || '').trim();
  if (query.length < 2) return c.json([]);
  const sql = db(c.env);
  const like = `%${query}%`;
  let generic = [];
  try {
    generic = await sql`
      SELECT food_code::text AS code, name::text AS product_name, category::text AS brands,
        energy_kcal::text AS kcal, proteins::text AS proteins, available_carbohydrates::text AS carbs,
        lipids::text AS fat, soluble_sugars::text AS sugars, total_fiber::text AS fiber
      FROM foodcompositionraw WHERE name ILIKE ${like} LIMIT 80
    `;
  } catch (error) {
    console.error('Ricerca foodcompositionraw fallita', error.message);
  }
  let packaged = [];
  try {
    packaged = await sql`
      SELECT code::text AS code, product_name::text AS product_name, brands::text AS brands,
        energy_kcal_100g::text AS kcal, proteins_100g::text AS proteins, carbohydrates_100g::text AS carbs,
        fat_100g::text AS fat, sugars_100g::text AS sugars, fiber_100g::text AS fiber
      FROM food_and_nutritional_value WHERE product_name ILIKE ${like} LIMIT 80
    `;
  } catch (error) {
    console.error('Ricerca food_and_nutritional_value fallita', error.message);
  }

  const q = query.toLowerCase();
  const rank = (food) => {
    const name = food.product_name.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.split(/[\s,()/-]+/).some((word) => word.startsWith(q))) return 2;
    return 3;
  };
  const seen = new Set();
  const foods = [...generic.map((row) => normalizeFood(row, 'crea')), ...packaged.map((row) => normalizeFood(row, 'off'))]
    .filter((food) => food.product_name && food.energy_kcal_100g !== null)
    .filter((food) => {
      const key = `${food.product_name.toLowerCase()}|${(food.brands || '').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => rank(a) - rank(b) || (a.source === b.source ? 0 : a.source === 'crea' ? -1 : 1) || a.product_name.length - b.product_name.length);
  return c.json(foods.slice(0, 30));
});

// Il coach puo' gestire solo le diete dei propri atleti.
async function loadOwnedDiet(sql, user, id) {
  const rows = await sql`SELECT * FROM diete WHERE dietaid = ${id}`;
  if (!rows[0]) return { error: 'Dieta non trovata', status: 404 };
  if (!await assertAccessToAthlete(sql, user, rows[0].utenteid)) return { error: 'Accesso negato', status: 403 };
  return { diet: rows[0] };
}

const mealJson = (pasto) => {
  if (!pasto?.alimenti_json) return null;
  return typeof pasto.alimenti_json === 'string' ? pasto.alimenti_json : JSON.stringify(pasto.alimenti_json);
};

async function insertMeals(sql, dietId, pasti) {
  for (const pasto of pasti) {
    if (!pasto?.tipopasto) continue;
    await sql`
      INSERT INTO pastidieta (dietaid, giorno_settimana, tipopasto, descrizione, alimenti_json)
      VALUES (${dietId}, ${pasto.giorno_settimana || 'Lunedi'}, ${pasto.tipopasto}, ${pasto.descrizione || null}, ${mealJson(pasto)})
    `;
  }
}

// GET /diets?utenteId= - list diets for an athlete
app.get('/', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId: qUtenteId } = c.req.query();
  const { utenteId, error } = resolveTargetUserId(user, qUtenteId);
  if (error) return c.json({ message: error }, 400);

  const ok = await assertAccessToAthlete(sql, user, utenteId);
  if (!ok) return c.json({ message: 'Accesso negato' }, 403);

  const rows = await sql`
    SELECT * FROM diete WHERE utenteid = ${utenteId} ORDER BY datainizio DESC NULLS LAST, dietaid DESC
  `;
  return c.json(rows);
});

// GET /diets/:id - diet + meals
app.get('/:id', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const id = Number(c.req.param('id'));

  const rows = await sql`SELECT * FROM diete WHERE dietaid = ${id}`;
  const diet = rows[0];
  if (!diet) return c.json({ message: 'Dieta non trovata' }, 404);

  const ok = await assertAccessToAthlete(sql, user, diet.utenteid);
  if (!ok) return c.json({ message: 'Accesso negato' }, 403);

  const pasti = await sql`SELECT * FROM pastidieta WHERE dietaid = ${id} ORDER BY pastoid ASC`;
  return c.json({ ...diet, pasti });
});

// POST /diets - coach creates a diet for an athlete
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const { utenteId, nome, datainizio, datafine, macrototali, notegenerali, pasti, fabbisogno } = await c.req.json();
  if (!utenteId || !nome) return c.json({ message: 'utenteId e nome sono richiesti' }, 400);
  if (!await assertAccessToAthlete(sql, c.get('user'), Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);

  const inserted = await sql`
    INSERT INTO diete (utenteid, nome, datainizio, datafine, attiva, notegenerali, macrototali, fabbisogno_json)
    VALUES (${utenteId}, ${nome}, ${datainizio || null}, ${datafine || null}, 1, ${notegenerali || null}, ${macrototali || null},
            ${fabbisogno ? JSON.stringify(fabbisogno) : null})
    RETURNING *
  `;
  const diet = inserted[0];
  if (Array.isArray(pasti)) await insertMeals(sql, diet.dietaid, pasti);
  await notify(sql, Number(utenteId), {
    tipo: 'dieta',
    mittenteId: c.get('user').userId,
    titolo: `Nuova dieta: ${nome}`,
    messaggio: datainizio ? `Valida dal ${fmtDay(datainizio)}${datafine ? ` al ${fmtDay(datafine)}` : ''}` : null,
    link: { screen: 'DietDetail', params: { dietId: diet.dietaid } },
  });
  return c.json(diet);
});

// PUT /diets/:id - coach edits a diet
app.put('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const owned = await loadOwnedDiet(sql, c.get('user'), id);
  if (owned.error) return c.json({ message: owned.error }, owned.status);
  const { nome, datainizio, datafine, macrototali, notegenerali, attiva, fabbisogno } = await c.req.json();

  const updated = await sql`
    UPDATE diete SET
      nome = COALESCE(${nome || null}, nome),
      datainizio = COALESCE(${datainizio || null}, datainizio),
      datafine = COALESCE(${datafine || null}, datafine),
      macrototali = COALESCE(${macrototali ?? null}, macrototali),
      notegenerali = COALESCE(${notegenerali ?? null}, notegenerali),
      attiva = COALESCE(${typeof attiva === 'undefined' ? null : attiva ? 1 : 0}, attiva),
      fabbisogno_json = COALESCE(${fabbisogno ? JSON.stringify(fabbisogno) : null}, fabbisogno_json)
    WHERE dietaid = ${id}
    RETURNING *
  `;
  if (!updated[0]) return c.json({ message: 'Dieta non trovata' }, 404);
  return c.json(updated[0]);
});

// PUT /diets/:id/meals - coach replaces the meal list
app.put('/:id/meals', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const owned = await loadOwnedDiet(sql, c.get('user'), id);
  if (owned.error) return c.json({ message: owned.error }, owned.status);
  const { pasti } = await c.req.json();
  if (!Array.isArray(pasti)) return c.json({ message: 'pasti deve essere un array' }, 400);

  await sql`DELETE FROM pastidieta WHERE dietaid = ${id}`;
  await insertMeals(sql, id, pasti);
  const rows = await sql`SELECT * FROM pastidieta WHERE dietaid = ${id} ORDER BY pastoid ASC`;
  return c.json(rows);
});

// DELETE /diets/:id
app.delete('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const owned = await loadOwnedDiet(sql, c.get('user'), id);
  if (owned.error) return c.json({ message: owned.error }, owned.status);
  await sql`DELETE FROM diete WHERE dietaid = ${id}`;
  return c.json({ message: 'Eliminata' });
});

export default app;
