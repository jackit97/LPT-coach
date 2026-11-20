import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete, assertCoachOwnsAthlete } from '../utils.js';
import { notify } from '../lib/notify.js';

// Consigli del coach all'atleta: messaggi brevi che l'atleta trova nella sua Home
const app = new Hono();
app.use('*', authenticate());

// GET /tips?utenteId=
app.get('/', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);
  if (!await assertAccessToAthlete(sql, user, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  const rows = await sql`SELECT tip_id, testo, created_at FROM coach_tips WHERE athlete_id = ${utenteId} ORDER BY created_at DESC LIMIT 100`;
  return c.json(rows);
});

// POST /tips { utenteId, testo }
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId, testo } = await c.req.json().catch(() => ({}));
  const text = String(testo || '').trim().slice(0, 2000);
  if (!utenteId || !text) return c.json({ message: 'Scrivi il consiglio' }, 400);
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);
  const rows = await sql`
    INSERT INTO coach_tips (coach_id, athlete_id, testo) VALUES (${user.userId}, ${Number(utenteId)}, ${text})
    RETURNING tip_id, testo, created_at
  `;
  await notify(sql, Number(utenteId), {
    tipo: 'consiglio',
    mittenteId: user.userId,
    titolo: 'Nuovo consiglio dal coach',
    messaggio: text.slice(0, 160),
    link: { screen: 'AthleteHome', params: {} },
  });
  return c.json(rows[0], 201);
});

// DELETE /tips/:id
app.delete('/:id{[0-9]+}', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const tip = (await sql`SELECT * FROM coach_tips WHERE tip_id = ${Number(c.req.param('id'))}`)[0];
  if (!tip || !await assertCoachOwnsAthlete(sql, user.userId, tip.athlete_id)) return c.json({ message: 'Consiglio non trovato' }, 404);
  await sql`DELETE FROM coach_tips WHERE tip_id = ${tip.tip_id}`;
  return c.json({ message: 'Eliminato' });
});

export default app;
