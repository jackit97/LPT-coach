import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck, verifyToken } from '../auth.js';
import { notify } from '../lib/notify.js';
import { todayIso } from '../lib/trainingLoad.js';

// Profilo developer: utilizzo dell'app (chi e' online, minuti), errori (server e app) e segnalazioni degli utenti.
const app = new Hono();
const cut = (value, max) => (value === null || value === undefined ? null : String(value).slice(0, max));
const missingTables = (error) => /app_activity|app_errors|app_feedback|ultimo_accesso_at/.test(String(error?.message));
const missingChat = (error) => /app_feedback_messages|letto_/.test(String(error?.message));

// POST /dev/errors — errore dell'app (anche senza login: puo' capitare prima di entrare)
app.post('/errors', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  let userId = null;
  const header = c.req.header('Authorization') || '';
  if (header.startsWith('Bearer ')) {
    try { userId = (await verifyToken(header.slice(7), c.env.JWT_SECRET || 'dev-secret')).userId || null; } catch { userId = null; }
  }
  if (!body.messaggio) return c.json({ ok: false }, 400);
  try {
    await db(c.env)`
      INSERT INTO app_errors (origine, utenteid, percorso, messaggio, stack, user_agent, versione_app)
      VALUES ('app', ${userId}, ${cut(body.schermata, 300)}, ${cut(body.messaggio, 2000)}, ${cut(body.stack, 6000)},
              ${cut(c.req.header('user-agent'), 300)}, ${cut(body.versione, 40)})
    `;
  } catch (error) {
    if (!missingTables(error)) throw error;
  }
  return c.json({ ok: true });
});

app.use('*', authenticate());

// POST /dev/heartbeat { piattaforma } — ogni minuto mentre l'app e' aperta: "online ora" e minuti di utilizzo
app.post('/heartbeat', async (c) => {
  const user = c.get('user');
  const { piattaforma } = await c.req.json().catch(() => ({}));
  try {
    await db(c.env)`
      WITH seen AS (UPDATE utenti SET ultimo_accesso_at = NOW() WHERE utenteid = ${user.userId} RETURNING utenteid)
      INSERT INTO app_activity (utenteid, giorno, minuti, piattaforma)
      SELECT utenteid, ${todayIso()}::date, 1, ${cut(piattaforma, 20)} FROM seen
      ON CONFLICT (utenteid, giorno) DO UPDATE SET
        minuti = app_activity.minuti + CASE WHEN app_activity.ultimo_accesso < NOW() - INTERVAL '45 seconds' THEN 1 ELSE 0 END,
        ultimo_accesso = NOW(),
        piattaforma = COALESCE(EXCLUDED.piattaforma, app_activity.piattaforma)
    `;
  } catch (error) {
    if (!missingTables(error)) throw error;
  }
  return c.json({ ok: true });
});

// POST /dev/feedback { tipo, messaggio, schermata, versione } — segnalazione di un utente (coach o atleta)
app.post('/feedback', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const messaggio = String(body.messaggio || '').trim();
  if (messaggio.length < 5) return c.json({ message: 'Scrivi qualche parola in più su cosa non va o cosa migliorare' }, 400);
  const tipo = ['bug', 'miglioramento', 'altro'].includes(body.tipo) ? body.tipo : 'altro';
  const sql = db(c.env);
  let row;
  try {
    row = (await sql`
      INSERT INTO app_feedback (utenteid, tipo, messaggio, schermata, versione_app, user_agent)
      VALUES (${user.userId}, ${tipo}, ${messaggio.slice(0, 5000)}, ${cut(body.schermata, 100)}, ${cut(body.versione, 40)}, ${cut(c.req.header('user-agent'), 300)})
      RETURNING *
    `)[0];
  } catch (error) {
    if (missingTables(error)) return c.json({ message: 'Segnalazioni non ancora attive: va applicata la migrazione 20261126' }, 503);
    throw error;
  }
  // avvisa i developer (notifica in app + email)
  const developers = await sql`SELECT utenteid FROM utenti WHERE ruolo = 'developer'`;
  const label = { bug: 'Bug', miglioramento: 'Suggerimento', altro: 'Segnalazione' }[tipo];
  for (const dev of developers) {
    await notify(sql, dev.utenteid, {
      tipo: 'feedback', mittenteId: user.userId,
      titolo: `${label}: ${messaggio.slice(0, 80)}${messaggio.length > 80 ? '…' : ''}`,
      messaggio: messaggio.slice(0, 500),
      link: { screen: 'DevFeedback', params: { feedbackId: row.feedback_id } },
    });
  }
  return c.json({ ...row, message: 'Grazie! La segnalazione è stata inviata.' }, 201);
});

// GET /dev/feedback/mine — le mie segnalazioni con stato e ultimo messaggio della chat
app.get('/feedback/mine', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  try {
    return c.json(await sql`
      SELECT f.feedback_id, f.tipo, f.messaggio, f.stato, f.risposta, f.created_at, f.updated_at,
             (SELECT COUNT(*)::int FROM app_feedback_messages m WHERE m.feedback_id = f.feedback_id) AS n_messaggi,
             (SELECT m.da_developer FROM app_feedback_messages m WHERE m.feedback_id = f.feedback_id ORDER BY m.created_at DESC, m.message_id DESC LIMIT 1) AS ultimo_da_developer,
             EXISTS (SELECT 1 FROM app_feedback_messages m WHERE m.feedback_id = f.feedback_id AND m.da_developer
                     AND (f.letto_utente_at IS NULL OR m.created_at > f.letto_utente_at)) AS da_leggere
      FROM app_feedback f
      WHERE f.utenteid = ${user.userId} ORDER BY f.created_at DESC LIMIT 50
    `);
  } catch (error) {
    if (missingChat(error)) {
      return c.json(await sql`
        SELECT feedback_id, tipo, messaggio, stato, risposta, created_at, updated_at FROM app_feedback
        WHERE utenteid = ${user.userId} ORDER BY created_at DESC LIMIT 50
      `);
    }
    if (missingTables(error)) return c.json([]);
    throw error;
  }
});

// Chat di una segnalazione: la vede chi l'ha inviata e il developer
async function loadFeedbackFor(sql, user, id) {
  const feedback = (await sql`SELECT * FROM app_feedback WHERE feedback_id = ${id}`)[0];
  if (!feedback) return null;
  if (user.ruolo !== 'developer' && feedback.utenteid !== user.userId) return null;
  return feedback;
}

// GET /dev/feedback/:id/messages — il primo messaggio e' il testo della segnalazione
app.get('/feedback/:id{[0-9]+}/messages', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const feedback = await loadFeedbackFor(sql, user, Number(c.req.param('id')));
  if (!feedback) return c.json({ message: 'Segnalazione non trovata' }, 404);
  let rows = [];
  try {
    rows = await sql`
      SELECT message_id, da_developer, testo, created_at FROM app_feedback_messages
      WHERE feedback_id = ${feedback.feedback_id} ORDER BY created_at ASC, message_id ASC
    `;
  } catch (error) {
    if (!missingChat(error)) throw error;
    rows = feedback.risposta ? [{ message_id: -1, da_developer: true, testo: feedback.risposta, created_at: feedback.updated_at }] : [];
  }
  const first = { message_id: 0, da_developer: false, testo: feedback.messaggio, created_at: feedback.created_at };
  // conferma di lettura: aprire la chat segna come visti i messaggi dell'altra parte
  const owner = feedback.utenteid === user.userId;
  let read = { letto_utente_at: feedback.letto_utente_at || null, letto_dev_at: feedback.letto_dev_at || null };
  try {
    const updated = owner
      ? await sql`UPDATE app_feedback SET letto_utente_at = NOW() WHERE feedback_id = ${feedback.feedback_id} RETURNING letto_utente_at, letto_dev_at`
      : await sql`UPDATE app_feedback SET letto_dev_at = NOW() WHERE feedback_id = ${feedback.feedback_id} RETURNING letto_utente_at, letto_dev_at`;
    if (updated[0]) read = updated[0];
  } catch (error) {
    if (!/letto_/.test(String(error?.message))) throw error; // migrazione 20261129 non ancora applicata
  }
  return c.json({ feedback_id: feedback.feedback_id, stato: feedback.stato, ...read, messages: [first, ...rows] });
});

// POST /dev/feedback/:id/messages { testo } — risposta nella chat (utente o developer); l'altra parte riceve notifica ed email
app.post('/feedback/:id{[0-9]+}/messages', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const feedback = await loadFeedbackFor(sql, user, Number(c.req.param('id')));
  if (!feedback) return c.json({ message: 'Segnalazione non trovata' }, 404);
  const { testo } = await c.req.json().catch(() => ({}));
  const text = String(testo || '').trim().slice(0, 5000);
  if (!text) return c.json({ message: 'Scrivi un messaggio' }, 400);
  const fromDev = user.ruolo === 'developer' && feedback.utenteid !== user.userId;
  let message;
  try {
    message = (await sql`
      INSERT INTO app_feedback_messages (feedback_id, autore_id, da_developer, testo)
      VALUES (${feedback.feedback_id}, ${user.userId}, ${fromDev}, ${text})
      RETURNING message_id, da_developer, testo, created_at
    `)[0];
  } catch (error) {
    if (missingChat(error)) return c.json({ message: 'Chat non ancora attiva: va applicata la migrazione 20261129' }, 503);
    throw error;
  }
  // il developer che risponde prende in carico; l'utente che riscrive riapre la segnalazione
  const stato = fromDev ? (feedback.stato === 'nuovo' ? 'in_corso' : feedback.stato) : (['risolto', 'chiuso'].includes(feedback.stato) ? 'in_corso' : feedback.stato);
  await sql`
    UPDATE app_feedback SET stato = ${stato}, risposta = CASE WHEN ${fromDev} THEN ${text} ELSE risposta END, updated_at = NOW(),
      letto_dev_at = CASE WHEN ${fromDev} THEN NOW() ELSE letto_dev_at END,
      letto_utente_at = CASE WHEN ${fromDev} THEN letto_utente_at ELSE NOW() END
    WHERE feedback_id = ${feedback.feedback_id}
  `;
  if (fromDev) {
    if (feedback.utenteid) {
      await notify(sql, feedback.utenteid, {
        tipo: 'feedback', mittenteId: user.userId,
        titolo: 'Nuova risposta alla tua segnalazione',
        messaggio: text.slice(0, 500),
        link: { screen: 'Feedback', params: { feedbackId: feedback.feedback_id } },
      });
    }
  } else {
    const developers = await sql`SELECT utenteid FROM utenti WHERE ruolo = 'developer' AND utenteid <> ${user.userId}`;
    for (const dev of developers) {
      await notify(sql, dev.utenteid, {
        tipo: 'feedback', mittenteId: user.userId,
        titolo: `Risposta su: ${String(feedback.messaggio).slice(0, 60)}${feedback.messaggio.length > 60 ? '…' : ''}`,
        messaggio: text.slice(0, 500),
        link: { screen: 'DevFeedback', params: { feedbackId: feedback.feedback_id } },
      });
    }
  }
  return c.json({ ...message, stato }, 201);
});

// --- solo developer ---
app.use('/overview', roleCheck('developer'));
app.use('/errors/*', roleCheck('developer'));
app.use('/admin/*', roleCheck('developer'));

app.get('/overview', async (c) => {
  const sql = db(c.env);
  const today = todayIso();
  try {
    const [online, roles, todayRow, days, users, errors, feedback] = await Promise.all([
      sql`SELECT utenteid, nome, cognome, ruolo, ultimo_accesso_at FROM utenti WHERE ultimo_accesso_at > NOW() - INTERVAL '5 minutes' ORDER BY ultimo_accesso_at DESC`,
      sql`SELECT ruolo, COUNT(*)::int AS totale, COUNT(*) FILTER (WHERE dataregistrazione > NOW() - INTERVAL '7 days')::int AS nuovi_7g FROM utenti GROUP BY ruolo`,
      sql`SELECT COUNT(*)::int AS utenti, COALESCE(SUM(minuti), 0)::int AS minuti FROM app_activity WHERE giorno = ${today}::date`,
      sql`SELECT giorno, COUNT(*)::int AS utenti, SUM(minuti)::int AS minuti FROM app_activity WHERE giorno > ${today}::date - 14 GROUP BY giorno ORDER BY giorno`,
      sql`
        SELECT u.utenteid, u.nome, u.cognome, u.ruolo, u.ultimo_accesso_at,
               COALESCE(SUM(a.minuti), 0)::int AS minuti_30g, COUNT(a.giorno)::int AS giorni_30g,
               COALESCE(SUM(a.minuti) FILTER (WHERE a.giorno > ${today}::date - 7), 0)::int AS minuti_7g
        FROM utenti u LEFT JOIN app_activity a ON a.utenteid = u.utenteid AND a.giorno > ${today}::date - 30
        GROUP BY u.utenteid ORDER BY minuti_30g DESC, u.ultimo_accesso_at DESC NULLS LAST LIMIT 100
      `,
      sql`SELECT COUNT(*) FILTER (WHERE NOT risolto)::int AS aperti, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS ultime_24h FROM app_errors`,
      sql`SELECT COUNT(*) FILTER (WHERE stato = 'nuovo')::int AS nuovi, COUNT(*) FILTER (WHERE stato IN ('nuovo', 'in_corso'))::int AS aperti FROM app_feedback`,
    ]);
    return c.json({
      online, ruoli: roles, oggi: todayRow[0], giorni: days.map((d) => ({ ...d, giorno: String(d.giorno instanceof Date ? d.giorno.toISOString() : d.giorno).slice(0, 10) })),
      utenti: users, errori: errors[0], feedback: feedback[0],
    });
  } catch (error) {
    if (missingTables(error)) return c.json({ message: 'Va applicata la migrazione 20261126_developer_privacy_email.sql' }, 503);
    throw error;
  }
});

// GET /dev/errors?stato=aperti|tutti
app.get('/errors', roleCheck('developer'), async (c) => {
  const all = c.req.query('stato') === 'tutti';
  const rows = await db(c.env)`
    SELECT e.*, u.nome, u.cognome, u.ruolo FROM app_errors e LEFT JOIN utenti u ON u.utenteid = e.utenteid
    WHERE ${all}::boolean OR NOT e.risolto
    ORDER BY e.created_at DESC LIMIT 200
  `;
  return c.json(rows);
});

app.put('/errors/:id{[0-9]+}', async (c) => {
  const { risolto } = await c.req.json().catch(() => ({}));
  await db(c.env)`UPDATE app_errors SET risolto = ${!!risolto} WHERE error_id = ${Number(c.req.param('id'))}`;
  return c.json({ ok: true });
});

// segna risolti tutti gli errori uguali (stesso messaggio) o tutti
app.post('/errors/resolve', async (c) => {
  const { messaggio } = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const rows = messaggio
    ? await sql`UPDATE app_errors SET risolto = TRUE WHERE NOT risolto AND messaggio = ${messaggio} RETURNING error_id`
    : await sql`UPDATE app_errors SET risolto = TRUE WHERE NOT risolto RETURNING error_id`;
  return c.json({ risolti: rows.length });
});

app.get('/admin/feedback', async (c) => {
  const sql = db(c.env);
  try {
    return c.json(await sql`
      SELECT f.*, u.nome, u.cognome, u.email, u.ruolo,
             (SELECT COUNT(*)::int FROM app_feedback_messages m WHERE m.feedback_id = f.feedback_id) AS n_messaggi,
             (SELECT m.da_developer FROM app_feedback_messages m WHERE m.feedback_id = f.feedback_id ORDER BY m.created_at DESC, m.message_id DESC LIMIT 1) AS ultimo_da_developer,
             (f.letto_dev_at IS NULL OR EXISTS (SELECT 1 FROM app_feedback_messages m WHERE m.feedback_id = f.feedback_id AND NOT m.da_developer
                     AND m.created_at > f.letto_dev_at)) AS da_leggere
      FROM app_feedback f LEFT JOIN utenti u ON u.utenteid = f.utenteid
      ORDER BY (f.stato IN ('nuovo', 'in_corso')) DESC, f.updated_at DESC NULLS LAST, f.created_at DESC LIMIT 200
    `);
  } catch (error) {
    if (!missingChat(error)) throw error;
    return c.json(await sql`
      SELECT f.*, u.nome, u.cognome, u.email, u.ruolo FROM app_feedback f LEFT JOIN utenti u ON u.utenteid = f.utenteid
      ORDER BY (f.stato IN ('nuovo', 'in_corso')) DESC, f.created_at DESC LIMIT 200
    `);
  }
});

// PUT /dev/admin/feedback/:id { stato, risposta } — la risposta arriva all'utente come notifica (ed email)
app.put('/admin/feedback/:id{[0-9]+}', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const current = (await sql`SELECT * FROM app_feedback WHERE feedback_id = ${id}`)[0];
  if (!current) return c.json({ message: 'Segnalazione non trovata' }, 404);
  const stato = ['nuovo', 'in_corso', 'risolto', 'chiuso'].includes(body.stato) ? body.stato : current.stato;
  const risposta = body.risposta !== undefined ? (String(body.risposta || '').trim() || null) : current.risposta;
  const updated = (await sql`
    UPDATE app_feedback SET stato = ${stato}, risposta = ${risposta}, updated_at = NOW() WHERE feedback_id = ${id} RETURNING *
  `)[0];
  if (current.utenteid && (risposta !== current.risposta || stato !== current.stato)) {
    const statoLabel = { nuovo: 'ricevuta', in_corso: 'in lavorazione', risolto: 'risolta', chiuso: 'chiusa' }[stato];
    await notify(sql, current.utenteid, {
      tipo: 'feedback', mittenteId: user.userId,
      titolo: `La tua segnalazione è ${statoLabel}`,
      messaggio: risposta && risposta !== current.risposta ? risposta : `"${current.messaggio.slice(0, 120)}"`,
      link: { screen: 'Feedback', params: {} },
    });
  }
  return c.json(updated);
});

export default app;
