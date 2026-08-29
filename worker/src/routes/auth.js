import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken } from '../auth.js';

const app = new Hono();

function isBcryptHash(str) {
  return typeof str === 'string' && /^\$2[aby]\$/i.test(str);
}

app.post('/login', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ message: 'Email e password richiesti' }, 400);

  const sql = db(c.env);
  const rows = await sql`SELECT * FROM utenti WHERE email = ${email} LIMIT 1`;
  const user = rows[0];
  if (!user) return c.json({ message: 'Invalid credentials' }, 401);

  const valid = isBcryptHash(user.passwordhash)
    ? bcrypt.compareSync(password, user.passwordhash)
    : password === user.passwordhash;
  if (!valid) return c.json({ message: 'Invalid credentials' }, 401);

  const token = await signToken({ userId: user.utenteid, ruolo: user.ruolo }, c.env.JWT_SECRET || 'dev-secret');
  return c.json({
    token,
    user: { id: user.utenteid, nome: user.nome, email: user.email, ruolo: user.ruolo },
  });
});

app.post('/register', async (c) => {
  const { nome, email, password, ruolo } = await c.req.json();
  if (!nome || !email || !password || !ruolo) return c.json({ message: 'Missing fields' }, 400);
  if (!['cliente', 'personal_trainer'].includes(ruolo)) return c.json({ message: 'Invalid ruolo' }, 400);

  const sql = db(c.env);
  const exists = await sql`SELECT utenteid FROM utenti WHERE email = ${email} LIMIT 1`;
  if (exists.length) return c.json({ message: 'Email already registered' }, 400);

  const hash = bcrypt.hashSync(password, 10);
  const inserted = await sql`
    INSERT INTO utenti (nome, email, passwordhash, ruolo, dataregistrazione)
    VALUES (${nome}, ${email}, ${hash}, ${ruolo}, NOW())
    RETURNING utenteid
  `;
  const userId = inserted[0].utenteid;
  const token = await signToken({ userId, ruolo }, c.env.JWT_SECRET || 'dev-secret');
  return c.json({ user: { id: userId, nome, email, ruolo }, token });
});

app.post('/logout', (c) => c.json({ message: 'Logged out (client should discard token)' }));

export default app;
