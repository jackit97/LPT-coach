import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete } from '../utils.js';

const app = new Hono();
app.use('*', authenticate());

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
  const { utenteId, nome, datainizio, datafine, macrototali, notegenerali, pasti } = await c.req.json();
  if (!utenteId || !nome) return c.json({ message: 'utenteId e nome sono richiesti' }, 400);

  const inserted = await sql`
    INSERT INTO diete (utenteid, nome, datainizio, datafine, attiva, notegenerali, macrototali)
    VALUES (${utenteId}, ${nome}, ${datainizio || null}, ${datafine || null}, 1, ${notegenerali || null}, ${macrototali || null})
    RETURNING *
  `;
  const diet = inserted[0];

  if (Array.isArray(pasti)) {
    for (const pasto of pasti) {
      if (!pasto?.tipopasto) continue;
      await sql`
        INSERT INTO pastidieta (dietaid, tipopasto, descrizione)
        VALUES (${diet.dietaid}, ${pasto.tipopasto}, ${pasto.descrizione || null})
      `;
    }
  }
  return c.json(diet);
});

// PUT /diets/:id - coach edits a diet
app.put('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const { nome, datainizio, datafine, macrototali, notegenerali, attiva } = await c.req.json();

  const updated = await sql`
    UPDATE diete SET
      nome = COALESCE(${nome || null}, nome),
      datainizio = COALESCE(${datainizio || null}, datainizio),
      datafine = COALESCE(${datafine || null}, datafine),
      macrototali = COALESCE(${macrototali ?? null}, macrototali),
      notegenerali = COALESCE(${notegenerali ?? null}, notegenerali),
      attiva = COALESCE(${typeof attiva === 'undefined' ? null : attiva ? 1 : 0}, attiva)
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
  const { pasti } = await c.req.json();
  if (!Array.isArray(pasti)) return c.json({ message: 'pasti deve essere un array' }, 400);

  await sql`DELETE FROM pastidieta WHERE dietaid = ${id}`;
  for (const pasto of pasti) {
    if (!pasto?.tipopasto) continue;
    await sql`
      INSERT INTO pastidieta (dietaid, tipopasto, descrizione)
      VALUES (${id}, ${pasto.tipopasto}, ${pasto.descrizione || null})
    `;
  }
  const rows = await sql`SELECT * FROM pastidieta WHERE dietaid = ${id} ORDER BY pastoid ASC`;
  return c.json(rows);
});

// DELETE /diets/:id
app.delete('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  await sql`DELETE FROM diete WHERE dietaid = ${id}`;
  return c.json({ message: 'Eliminata' });
});

export default app;
