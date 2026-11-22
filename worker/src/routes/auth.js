import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken } from '../auth.js';
import { appUrl, emailConfigured, emailLayout, newEmailToken, sendEmail, sha256 } from '../lib/mailer.js';

export const PRIVACY_VERSION = '2026-11';
const EMAIL_TOKEN_HOURS = 48;

// Crea un nuovo link di verifica e lo invia. Il link punta al Worker stesso (GET /auth/verify-email).
export async function sendVerificationEmail(c, sql, user) {
  if (!emailConfigured(c.env)) return false;
  const { token, hash } = await newEmailToken();
  await sql`
    UPDATE utenti SET email_token_hash = ${hash}, email_token_scadenza = NOW() + (${EMAIL_TOKEN_HOURS} || ' hours')::interval
    WHERE utenteid = ${user.utenteid}
  `;
  const link = `${new URL(c.req.url).origin}/auth/verify-email?token=${token}`;
  const text = `Ciao ${user.nome},\nconferma il tuo indirizzo email per ricevere anche via email le notifiche di LPT Coach (nuovi allenamenti, risposte del coach, check).\nIl link vale ${EMAIL_TOKEN_HOURS} ore.`;
  const result = await sendEmail(c.env, {
    to: user.email,
    subject: 'Conferma la tua email - LPT Coach',
    text: `${text}\n${link}`,
    html: emailLayout({ title: 'Conferma la tua email', text, buttonLabel: 'Conferma email', buttonUrl: link, footer: 'Se non ti sei registrato tu su LPT Coach puoi ignorare questa email.' }),
  });
  return result.sent;
}

const htmlPage = (title, text, ok, env) => `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#F2F4F7;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;margin:16px;text-align:center">
<div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h1 style="font-size:20px;color:#101828">${title}</h1><p style="color:#475467;line-height:22px">${text}</p>
<a href="${appUrl(env)}" style="display:inline-block;margin-top:8px;background:#0B3D91;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Apri LPT Coach</a>
</div></body></html>`;



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
    user: { id: user.utenteid, nome: user.nome, cognome: user.cognome || null, email: user.email, ruolo: user.ruolo },
  });
});

// GET /auth/verify-email?token= — link aperto dall'email
app.get('/verify-email', async (c) => {
  const token = String(c.req.query('token') || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return c.html(htmlPage('Link non valido', 'Il link di verifica non è valido. Richiedine uno nuovo dal tuo Profilo.', false, c.env), 400);
  const sql = db(c.env);
  const rows = await sql`
    UPDATE utenti SET email_verificata = TRUE, email_verificata_at = NOW(), email_token_hash = NULL, email_token_scadenza = NULL
    WHERE email_token_hash = ${await sha256(token)} AND email_token_scadenza > NOW()
    RETURNING utenteid, nome
  `;
  if (!rows[0]) return c.html(htmlPage('Link scaduto', 'Il link è scaduto o è già stato usato. Puoi richiederne uno nuovo dal tuo Profilo in LPT Coach.', false, c.env), 400);
  return c.html(htmlPage('Email verificata', `Grazie ${rows[0].nome}! Da ora riceverai anche via email le notifiche di LPT Coach. Puoi disattivarle dal Profilo.`, true, c.env));
});

app.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const nome = String(body.nome || '').trim();
  const cognome = String(body.cognome || '').trim();
  const email = String(body.email || '').trim();
  const { password } = body;
  if (!nome || !cognome || !email || !password) return c.json({ message: 'Compila nome, cognome, email e password' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ message: 'Email non valida' }, 400);
  if (String(password).length < 8) return c.json({ message: 'La password deve avere almeno 8 caratteri' }, 400);
  // GDPR: informativa privacy e consenso esplicito al trattamento dei dati sulla salute sono obbligatori
  if (body.privacy !== true || body.datiSalute !== true) {
    return c.json({ message: 'Per registrarti devi accettare l\'informativa privacy e il trattamento dei dati sulla salute' }, 400);
  }
  // Dall'app ci si registra solo come atleta: gli account coach li crea l'amministratore.
  const ruolo = 'cliente';

  const sql = db(c.env);
  const exists = await sql`SELECT utenteid FROM utenti WHERE LOWER(TRIM(email)) = ${email.toLowerCase()} LIMIT 1`;
  if (exists.length) return c.json({ message: 'Email già registrata' }, 400);

  const hash = bcrypt.hashSync(password, 10);
  const inserted = await sql`
    INSERT INTO utenti (nome, cognome, email, passwordhash, ruolo, dataregistrazione, privacy_accettata_at, privacy_versione, consenso_salute_at)
    VALUES (${nome}, ${cognome}, ${email}, ${hash}, ${ruolo}, NOW(), NOW(), ${PRIVACY_VERSION}, NOW())
    RETURNING utenteid
  `;
  const userId = inserted[0].utenteid;
  let emailSent = false;
  try { emailSent = await sendVerificationEmail(c, sql, { utenteid: userId, nome, email }); } catch (error) { console.error('Verifica email non inviata:', error?.message); }
  const token = await signToken({ userId, ruolo }, c.env.JWT_SECRET || 'dev-secret');
  return c.json({ user: { id: userId, nome, cognome, email, ruolo }, token, emailVerificaInviata: emailSent });
});

app.post('/logout', (c) => c.json({ message: 'Logged out (client should discard token)' }));

export default app;
