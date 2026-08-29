import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';

const app = new Hono();
app.use('*', authenticate());

// GET /videos - library of video tutorials (shared across the coach's athletes)
app.get('/', async (c) => {
  const sql = db(c.env);
  const rows = await sql`SELECT * FROM videotutorial ORDER BY datacaricamento DESC`;
  return c.json(rows);
});

// POST /videos - coach adds a tutorial (external URL, e.g. YouTube/Vimeo/CDN link)
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { titolo, descrizione, videourl, esercizioId } = await c.req.json();
  if (!titolo || !videourl) return c.json({ message: 'titolo e videourl sono richiesti' }, 400);

  const inserted = await sql`
    INSERT INTO videotutorial (titolo, esercizioid, descrizione, videourl, creatodaid)
    VALUES (${titolo}, ${esercizioId || null}, ${descrizione || null}, ${videourl}, ${user.userId})
    RETURNING *
  `;
  return c.json(inserted[0]);
});

// DELETE /videos/:id
app.delete('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  await sql`DELETE FROM videotutorial WHERE videoid = ${id}`;
  return c.json({ message: 'Eliminato' });
});

export default app;
