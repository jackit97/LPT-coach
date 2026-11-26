import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete, assertCoachOwnsAthlete } from '../utils.js';
import { notify, fmtDay, userName, coachOf } from '../lib/notify.js';
import { appUrl } from '../lib/mailer.js';

const app = new Hono();
// il webhook di Stripe arriva senza login (verificato con la firma)
app.use('*', async (c, next) => (c.req.path.endsWith('/stripe/webhook') ? next() : authenticate()(c, next)));

// ---------- pagamento dall'app: bonifico e Stripe ----------
// Coordinate bancarie (vars in wrangler.toml): PAYMENT_IBAN, PAYMENT_HOLDER, PAYMENT_BANK.
// Stripe (secret): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (facoltativo ma consigliato).
const DEFAULT_IBAN = 'IT60X0542811101000000123456'; // finto, da sostituire con PAYMENT_IBAN
const bankInfo = (env) => ({
  iban: (env.PAYMENT_IBAN || DEFAULT_IBAN).replace(/\s+/g, '').toUpperCase(),
  intestatario: env.PAYMENT_HOLDER || 'Filippo Cavallini',
  banca: env.PAYMENT_BANK || null,
  esempio: !env.PAYMENT_IBAN,
});
const stripeEnabled = (env) => Boolean(env.STRIPE_SECRET_KEY);

function safeOrigin(env, origin) {
  const value = String(origin || '').replace(/\/$/, '');
  if (value === appUrl(env)) return value;
  if (/^https:\/\/([a-z0-9-]+\.)?lpt-coach\.pages\.dev$/i.test(value)) return value;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)) return value;
  return appUrl(env);
}

async function stripeRequest(env, method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Stripe ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// segna pagato (una volta sola) e avvisa il coach
async function markPaidByAthlete(sql, payment, metodo, extra = {}) {
  const rows = await sql`
    UPDATE pagamenti SET stato = 'Pagato', datapagamento = NOW(), metodo = ${metodo},
      stripe_session_id = COALESCE(${extra.sessionId || null}, stripe_session_id)
    WHERE pagamentoid = ${payment.pagamentoid} AND stato <> 'Pagato'
    RETURNING *
  `;
  if (!rows[0]) return null;
  const coachId = payment.creatodaid || await coachOf(sql, payment.utenteid);
  if (coachId) {
    await notify(sql, coachId, {
      tipo: 'pagamento',
      mittenteId: payment.utenteid,
      titolo: `${await userName(sql, payment.utenteid)} ha pagato ${Number(payment.importo).toFixed(2)} € con carta`,
      messaggio: payment.causale || 'Pagamento',
      link: { screen: 'PaymentsHome', params: {} },
    });
  }
  return rows[0];
}

async function ownPayment(sql, user, id) {
  const payment = (await sql`SELECT * FROM pagamenti WHERE pagamentoid = ${id}`)[0];
  if (!payment || payment.utenteid !== user.userId) return null;
  return payment;
}

// GET /payments/methods — coordinate per il bonifico e se il pagamento con carta e' attivo
app.get('/methods', (c) => c.json({ bonifico: bankInfo(c.env), stripe: stripeEnabled(c.env) }));

// POST /payments/:id/bonifico — l'atleta segnala di aver fatto il bonifico: il coach controlla e conferma
app.post('/:id{[0-9]+}/bonifico', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const payment = await ownPayment(sql, user, Number(c.req.param('id')));
  if (!payment) return c.json({ message: 'Pagamento non trovato' }, 404);
  if (payment.stato === 'Pagato') return c.json({ message: 'Questo pagamento risulta già saldato' }, 400);
  let updated;
  try {
    updated = (await sql`
      UPDATE pagamenti SET stato = 'In verifica', metodo = 'bonifico', segnalato_at = NOW() WHERE pagamentoid = ${payment.pagamentoid} RETURNING *
    `)[0];
  } catch (error) {
    if (!/metodo|segnalato_at/.test(String(error?.message))) throw error; // migrazione 20261202 non applicata
    updated = (await sql`UPDATE pagamenti SET stato = 'In verifica' WHERE pagamentoid = ${payment.pagamentoid} RETURNING *`)[0];
  }
  const coachId = payment.creatodaid || await coachOf(sql, user.userId);
  if (coachId) {
    await notify(sql, coachId, {
      tipo: 'pagamento',
      mittenteId: user.userId,
      titolo: `${await userName(sql, user.userId)} ha fatto un bonifico di ${Number(payment.importo).toFixed(2)} €`,
      messaggio: `${payment.causale || 'Pagamento'} · controlla l'accredito e segnalo come pagato`,
      link: { screen: 'PaymentsHome', params: {} },
    });
  }
  return c.json({ ...updated, message: 'Grazie! Il coach riceve l\'avviso e confermerà il pagamento appena vede l\'accredito.' });
});

// POST /payments/:id/stripe { origin } -> { url } pagina di pagamento Stripe Checkout
app.post('/:id{[0-9]+}/stripe', async (c) => {
  const user = c.get('user');
  if (!stripeEnabled(c.env)) return c.json({ message: 'Il pagamento con carta non è ancora attivo' }, 503);
  const sql = db(c.env);
  const payment = await ownPayment(sql, user, Number(c.req.param('id')));
  if (!payment) return c.json({ message: 'Pagamento non trovato' }, 404);
  if (payment.stato === 'Pagato') return c.json({ message: 'Questo pagamento risulta già saldato' }, 400);
  const cents = Math.round(Number(payment.importo) * 100);
  if (!(cents >= 50)) return c.json({ message: 'Importo non valido per il pagamento con carta' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const origin = safeOrigin(c.env, body.origin);
  const athlete = (await sql`SELECT email, TRIM(CONCAT_WS(' ', nome, cognome)) AS nome FROM utenti WHERE utenteid = ${user.userId}`)[0] || {};
  let session;
  try {
    session = await stripeRequest(c.env, 'POST', 'checkout/sessions', {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][product_data][name]': (payment.causale || 'Pagamento LPT Coach').slice(0, 120),
      'line_items[0][price_data][product_data][description]': `LPT Coach · ${athlete.nome || ''}`.slice(0, 200),
      success_url: `${origin}/?pagamento=ok&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?pagamento=annullato`,
      client_reference_id: String(payment.pagamentoid),
      'metadata[pagamentoid]': String(payment.pagamentoid),
      'metadata[utenteid]': String(user.userId),
      'payment_intent_data[metadata][pagamentoid]': String(payment.pagamentoid),
      locale: 'it',
      ...(athlete.email ? { customer_email: athlete.email } : {}),
    });
  } catch (error) {
    console.error('stripe checkout', error?.message);
    return c.json({ message: `Stripe non ha avviato il pagamento: ${error.message}` }, 502);
  }
  try { await sql`UPDATE pagamenti SET stripe_session_id = ${session.id} WHERE pagamentoid = ${payment.pagamentoid}`; } catch { /* migrazione 20261202 */ }
  return c.json({ url: session.url });
});

// GET /payments/stripe/confirm?session_id= — al ritorno da Stripe: verifica il pagamento e lo segna saldato
app.get('/stripe/confirm', async (c) => {
  const user = c.get('user');
  if (!stripeEnabled(c.env)) return c.json({ message: 'Pagamento con carta non attivo' }, 503);
  const sessionId = String(c.req.query('session_id') || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return c.json({ message: 'Sessione non valida' }, 400);
  const sql = db(c.env);
  let session;
  try { session = await stripeRequest(c.env, 'GET', `checkout/sessions/${sessionId}`); } catch (error) {
    return c.json({ message: `Impossibile verificare il pagamento: ${error.message}` }, 502);
  }
  const payment = await ownPayment(sql, user, Number(session.metadata?.pagamentoid || session.client_reference_id));
  if (!payment) return c.json({ message: 'Pagamento non trovato' }, 404);
  if (session.payment_status !== 'paid') return c.json({ pagato: false, message: 'Il pagamento non risulta completato.' });
  await markPaidByAthlete(sql, payment, 'stripe', { sessionId });
  return c.json({ pagato: true, importo: payment.importo, message: `Pagamento di ${Number(payment.importo).toFixed(2)} € completato. Grazie!` });
});

// Verifica della firma del webhook Stripe (header Stripe-Signature: t=...,v1=...)
async function validStripeSignature(secret, header, payload) {
  const parts = Object.fromEntries(String(header || '').split(',').map((item) => item.split('=')).filter((p) => p.length === 2));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === parts.v1;
}

// POST /payments/stripe/webhook — Stripe avvisa del pagamento completato (anche se l'atleta chiude la pagina)
app.post('/stripe/webhook', async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET) return c.json({ message: 'Webhook non configurato' }, 503);
  const payload = await c.req.text();
  if (!await validStripeSignature(c.env.STRIPE_WEBHOOK_SECRET, c.req.header('stripe-signature'), payload)) {
    return c.json({ message: 'Firma non valida' }, 400);
  }
  const event = JSON.parse(payload);
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session = event.data?.object || {};
    if (session.payment_status === 'paid') {
      const sql = db(c.env);
      const payment = (await sql`SELECT * FROM pagamenti WHERE pagamentoid = ${Number(session.metadata?.pagamentoid || session.client_reference_id)}`)[0];
      if (payment) await markPaidByAthlete(sql, payment, 'stripe', { sessionId: session.id });
    }
  }
  return c.json({ received: true });
});

// GET /payments?utenteId= - list payments for an athlete
// GET /payments/all — coach: pagamenti di tutti i suoi atleti (panoramica)
app.get('/all', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`
    SELECT p.*, TRIM(CONCAT_WS(' ', u.nome, u.cognome)) AS atleta
    FROM pagamenti p
    JOIN utenti u ON u.utenteid = p.utenteid
    JOIN pt_clienti pc ON pc.cliente_userid = p.utenteid AND pc.pt_userid = ${user.userId} AND pc.attivo = 1
    ORDER BY (p.stato = 'Pagato') ASC, p.scadenza ASC NULLS LAST, p.pagamentoid DESC
  `;
  return c.json(rows);
});

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
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);

  const inserted = await sql`
    INSERT INTO pagamenti (utenteid, datapagamento, importo, scadenza, causale, creatodaid, stato)
    VALUES (${utenteId}, ${datapagamento || null}, ${importo}, ${scadenza || null}, ${causale || null},
            ${user.userId}, ${stato || 'In sospeso'})
    RETURNING *
  `;
  await notify(sql, Number(utenteId), {
    tipo: 'pagamento',
    mittenteId: user.userId,
    titolo: `Nuovo pagamento: ${causale || 'quota'}`,
    messaggio: `${Number(importo).toFixed(2)} €${scadenza ? ` · scadenza ${fmtDay(scadenza)}` : ''}`,
    link: { screen: 'PaymentsHome', params: {} },
  });
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

// POST /payments/:id/conferma-bonifico { ricevuto: true|false } — il coach controlla l'accredito del bonifico segnalato
app.post('/:id{[0-9]+}/conferma-bonifico', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const payment = (await sql`SELECT * FROM pagamenti WHERE pagamentoid = ${Number(c.req.param('id'))}`)[0];
  if (!payment || !await assertCoachOwnsAthlete(sql, user.userId, payment.utenteid)) return c.json({ message: 'Pagamento non trovato' }, 404);
  const { ricevuto } = await c.req.json().catch(() => ({}));
  const importo = `${Number(payment.importo).toFixed(2)} €`;
  let updated;
  if (ricevuto) {
    updated = (await sql`
      UPDATE pagamenti SET stato = 'Pagato', datapagamento = COALESCE(datapagamento, NOW()), metodo = COALESCE(metodo, 'bonifico')
      WHERE pagamentoid = ${payment.pagamentoid} RETURNING *
    `)[0];
    await notify(sql, payment.utenteid, {
      tipo: 'pagamento', mittenteId: user.userId,
      titolo: `Pagamento confermato: ${payment.causale || 'quota'}`,
      messaggio: `Il coach ha ricevuto il bonifico di ${importo}. Grazie!`,
      link: { screen: 'PaymentsHome', params: {} },
    });
  } else {
    updated = (await sql`UPDATE pagamenti SET stato = 'In sospeso' WHERE pagamentoid = ${payment.pagamentoid} RETURNING *`)[0];
    await notify(sql, payment.utenteid, {
      tipo: 'pagamento', mittenteId: user.userId,
      titolo: `Bonifico non ancora ricevuto: ${payment.causale || 'quota'}`,
      messaggio: `Il coach non ha ancora visto l'accredito di ${importo}: controlla il bonifico (IBAN e importo) o contattalo.`,
      link: { screen: 'PaymentsHome', params: {} },
    });
  }
  return c.json(updated);
});

// DELETE /payments/:id
app.delete('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  await sql`DELETE FROM pagamenti WHERE pagamentoid = ${id}`;
  return c.json({ message: 'Eliminato' });
});

export default app;
