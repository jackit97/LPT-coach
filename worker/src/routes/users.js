import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';

const app = new Hono();
app.use('*', authenticate());

// Current user profile
app.get('/me', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`SELECT utenteid, nome, email, ruolo, dataregistrazione FROM utenti WHERE utenteid = ${user.userId}`;
  if (!rows[0]) return c.json({ message: 'Not found' }, 404);
  return c.json(rows[0]);
});

// Coach: list assigned athletes (clients)
app.get('/clients', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`
    SELECT u.utenteid, u.nome, u.email, u.dataregistrazione
    FROM pt_clienti pc
    JOIN utenti u ON u.utenteid = pc.cliente_userid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1
    ORDER BY u.nome ASC
  `;
  return c.json(rows);
});

// Coach: attach an existing athlete (by email) to their client list
app.post('/clients', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { email } = await c.req.json();
  if (!email) return c.json({ message: 'email richiesta' }, 400);

  const sql = db(c.env);
  const athlete = await sql`SELECT utenteid FROM utenti WHERE email = ${email} AND ruolo = 'cliente' LIMIT 1`;
  if (!athlete[0]) return c.json({ message: 'Atleta non trovato' }, 404);

  await sql`
    INSERT INTO pt_clienti (pt_userid, cliente_userid, attivo)
    VALUES (${user.userId}, ${athlete[0].utenteid}, 1)
    ON CONFLICT (pt_userid, cliente_userid) DO UPDATE SET attivo = 1
  `;
  return c.json({ message: 'Atleta collegato' });
});

export default app;
