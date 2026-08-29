import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete } from '../utils.js';

const app = new Hono();
app.use('*', authenticate());

// GET /payments?utenteId= - list payments for an athlete
app.get('/', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId: qUtenteId } = c.req.query();
  const { utenteId, error } = resolveTargetUserId(user, qUtenteId);
  if (error) return c.json({ message: error }, 400);

  const ok = await assertAccessToAthlete(sql, user, utenteId);
  if (!ok) return c.json({ message: 'Accesso negato' }, 403);

  const rows = await sql`
    SELECT * FROM pagamenti WHERE utenteid = ${utenteId} ORDER BY scadenza DESC NULLS LAST, pagamentoid DESC
  `;
  return c.json(rows);
});

// POST /payments - coach registers a payment for an athlete
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId, importo, scadenza, causale, stato, datapagamento } = await c.req.json();
  if (!utenteId || !importo) return c.json({ message: 'utenteId e importo sono richiesti' }, 400);

  const inserted = await sql`
    INSERT INTO pagamenti (utenteid, datapagamento, importo, scadenza, causale, creatodaid, stato)
    VALUES (${utenteId}, ${datapagamento || null}, ${importo}, ${scadenza || null}, ${causale || null},
            ${user.userId}, ${stato || 'In sospeso'})
    RETURNING *
  `;
  return c.json(inserted[0]);
});

// PUT /payments/:id - coach updates a payment (e.g. mark as paid)
app.put('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const { importo, scadenza, causale, stato, datapagamento } = await c.req.json();

  const updated = await sql`
    UPDATE pagamenti SET
      importo = COALESCE(${importo ?? null}, importo),
      scadenza = COALESCE(${scadenza || null}, scadenza),
      causale = COALESCE(${causale ?? null}, causale),
      stato = COALESCE(${stato || null}, stato),
      datapagamento = COALESCE(${datapagamento || null}, datapagamento)
    WHERE pagamentoid = ${id}
    RETURNING *
  `;
  if (!updated[0]) return c.json({ message: 'Pagamento non trovato' }, 404);
  return c.json(updated[0]);
});

// DELETE /payments/:id
app.delete('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  await sql`DELETE FROM pagamenti WHERE pagamentoid = ${id}`;
  return c.json({ message: 'Eliminato' });
});

export default app;
