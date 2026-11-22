import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate } from '../auth.js';

const app = new Hono();
app.use('*', authenticate());

const parse = (row) => {
  let link = null;
  try { link = row.link_json ? JSON.parse(row.link_json) : null; } catch { link = null; }
  const { link_json: _ignored, ...rest } = row;
  return { ...rest, link };
};

// GET /notifications?limit=50 - ultime notifiche dell'utente + numero di non lette
app.get('/', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));
  const rows = await sql`
    SELECT n.*, TRIM(CONCAT_WS(' ', u.nome, u.cognome)) AS mittente_nome
    FROM notifiche n LEFT JOIN utenti u ON u.utenteid = n.mittente_id
    WHERE n.utenteid = ${user.userId}
    ORDER BY n.created_at DESC, n.notifica_id DESC
    LIMIT ${limit}
  `;
  const unread = await sql`SELECT COUNT(*)::int AS n FROM notifiche WHERE utenteid = ${user.userId} AND letta = false`;
  return c.json({ unread: unread[0]?.n || 0, items: rows.map(parse) });
});

// GET /notifications/unread-count - usato dal badge della campanella (polling leggero)
app.get('/unread-count', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`SELECT COUNT(*)::int AS n FROM notifiche WHERE utenteid = ${user.userId} AND letta = false`;
  return c.json({ unread: rows[0]?.n || 0 });
});

app.post('/read-all', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  await sql`UPDATE notifiche SET letta = true WHERE utenteid = ${user.userId} AND letta = false`;
  return c.json({ unread: 0 });
});

app.post('/:id/read', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  await sql`UPDATE notifiche SET letta = true WHERE notifica_id = ${Number(c.req.param('id'))} AND utenteid = ${user.userId}`;
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  await sql`DELETE FROM notifiche WHERE notifica_id = ${Number(c.req.param('id'))} AND utenteid = ${user.userId}`;
  return c.json({ ok: true });
});

export default app;
