import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';

const app = new Hono();
app.use('*', authenticate());

app.get('/', async (c) => {
  const sql = db(c.env);
  const { q } = c.req.query();
  const search = `%${String(q || '').trim()}%`;
  const rows = await sql`
    SELECT esercizioid AS id, nomeesercizio AS nome
    FROM esercizifull
    WHERE nomeesercizio ILIKE ${search}
    ORDER BY nomeesercizio ASC
    LIMIT 100
  `;
  return c.json(rows);
});

app.post('/', roleCheck('personal_trainer'), async (c) => {
  const { nome } = await c.req.json();
  if (!nome?.trim()) return c.json({ message: 'nome richiesto' }, 400);

  const sql = db(c.env);
  const inserted = await sql`
    INSERT INTO esercizifull (nomeesercizio)
    VALUES (${nome.trim()})
    RETURNING esercizioid AS id, nomeesercizio AS nome
  `;
  return c.json(inserted[0], 201);
});

export default app;
