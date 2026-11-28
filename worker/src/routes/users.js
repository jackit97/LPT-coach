import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { sendVerificationEmail, PRIVACY_VERSION } from './auth.js';
import { emailConfigured } from '../lib/mailer.js';

const app = new Hono();
app.use('*', authenticate());

// Current user profile
app.get('/me', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`
    SELECT u.utenteid, u.nome, u.email, u.ruolo, u.dataregistrazione, u.endurance_enabled, u.endurance_visibile, u.dieta_visibile,
           COALESCE(NULLIF(TRIM(u.cognome), ''), p.cognome) AS cognome, p.pesokg, p.altezzacm, p.obiettivoallenamento,
           p.durata_allenamento_minuti, p.giorni_allenamento, p.livellofitness,
           p.datanascita, p.sesso
    FROM utenti u LEFT JOIN profiloutente p ON p.utenteid = u.utenteid
    WHERE u.utenteid = ${user.userId}
  `;
  if (!rows[0]) return c.json({ message: 'Not found' }, 404);
  const row = rows[0];
  // consensi privacy e stato dell'email (colonne della migrazione 20261126: se mancano l'app funziona come prima)
  let account = { email_verificata: true, notifiche_email: true, privacy_accettata_at: 'n/d', consenso_salute_at: 'n/d', privacy_versione: PRIVACY_VERSION };
  try {
    account = (await sql`
      SELECT email_verificata, notifiche_email, privacy_accettata_at, consenso_salute_at, privacy_versione FROM utenti WHERE utenteid = ${user.userId}
    `)[0] || account;
  } catch { /* migrazione non ancora applicata */ }
  Object.assign(row, account, { privacy_versione_attuale: PRIVACY_VERSION, email_attiva: emailConfigured(c.env) });
  // Il coach vede sempre le sezioni endurance; per l'atleta decide il coach (sezione Atleti).
  let enduranceVisible = true;
  if (row.ruolo === 'cliente') enduranceVisible = await athleteEnduranceVisible(sql, row);
  // sezione forza/palestra (migrazione 20261203): visibile se la colonna non c'e' ancora
  let strengthVisible = true;
  if (row.ruolo === 'cliente') {
    try { strengthVisible = (await sql`SELECT forza_visibile FROM utenti WHERE utenteid = ${user.userId}`)[0]?.forza_visibile !== false; } catch { strengthVisible = true; }
  }
  // check fotografici + valutazione corporea (migrazione 20261205)
  let progressVisible = true;
  if (row.ruolo === 'cliente') {
    try { progressVisible = (await sql`SELECT progressi_visibile FROM utenti WHERE utenteid = ${user.userId}`)[0]?.progressi_visibile !== false; } catch { progressVisible = true; }
  }
  const { endurance_visibile: _ignored, dieta_visibile: dietVisible, ...rest } = row;
  return c.json({ ...rest, endurance_visible: enduranceVisible, dieta_visible: row.ruolo !== 'cliente' || dietVisible !== false, forza_visible: strengthVisible, progressi_visible: progressVisible });
});

// POST /users/me/consent { privacy: true, datiSalute: true } — consensi per chi si era registrato prima
app.post('/me/consent', async (c) => {
  const user = c.get('user');
  const { privacy, datiSalute } = await c.req.json().catch(() => ({}));
  if (privacy !== true || datiSalute !== true) return c.json({ message: 'Per usare l\'app servono entrambi i consensi' }, 400);
  const sql = db(c.env);
  await sql`
    UPDATE utenti SET privacy_accettata_at = NOW(), privacy_versione = ${PRIVACY_VERSION}, consenso_salute_at = COALESCE(consenso_salute_at, NOW())
    WHERE utenteid = ${user.userId}
  `;
  return c.json({ ok: true, privacy_versione: PRIVACY_VERSION });
});

// POST /users/me/verify-email — invia di nuovo il link di verifica
app.post('/me/verify-email', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`SELECT utenteid, nome, email, email_verificata FROM utenti WHERE utenteid = ${user.userId}`;
  if (!rows[0]) return c.json({ message: 'Utente non trovato' }, 404);
  if (rows[0].email_verificata) return c.json({ message: 'La tua email è già verificata', verificata: true });
  if (!emailConfigured(c.env)) return c.json({ message: 'L\'invio delle email non è ancora configurato' }, 503);
  const sent = await sendVerificationEmail(c, sql, rows[0]);
  if (!sent) return c.json({ message: 'Invio non riuscito, riprova più tardi' }, 502);
  return c.json({ message: `Ti abbiamo inviato un link di conferma a ${rows[0].email}` });
});

// PUT /users/me/email-notifications { enabled }
app.put('/me/email-notifications', async (c) => {
  const user = c.get('user');
  const { enabled } = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  await sql`UPDATE utenti SET notifiche_email = ${!!enabled} WHERE utenteid = ${user.userId}`;
  return c.json({ notifiche_email: !!enabled });
});

// Visibilita' endurance di un atleta: scelta esplicita del coach, altrimenti la vecchia
// impostazione globale del coach (utenti.endurance_enabled del personal trainer).
async function athleteEnduranceVisible(sql, athlete) {
  if (athlete.endurance_visibile === true || athlete.endurance_visibile === false) return athlete.endurance_visibile;
  const coachRows = await sql`SELECT endurance_enabled FROM utenti WHERE ruolo = 'personal_trainer' ORDER BY utenteid ASC`;
  return coachRows.length ? coachRows.every((coach) => coach.endurance_enabled) : true;
}

// Coach: mostra/nasconde le sezioni endurance a un singolo atleta
app.put('/clients/:id{[0-9]+}/endurance', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const athleteId = Number(c.req.param('id'));
  const { visible } = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const link = await sql`SELECT 1 FROM pt_clienti WHERE pt_userid = ${user.userId} AND cliente_userid = ${athleteId} AND attivo = 1`;
  if (!link.length) return c.json({ message: 'Atleta non trovato' }, 404);
  await sql`UPDATE utenti SET endurance_visibile = ${!!visible} WHERE utenteid = ${athleteId}`;
  return c.json({ utenteid: athleteId, endurance_visible: !!visible });
});

// Coach: mostra/nasconde la sezione dieta a un singolo atleta (non tutti seguono anche l'alimentazione)
app.put('/clients/:id{[0-9]+}/dieta', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const athleteId = Number(c.req.param('id'));
  const { visible } = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const link = await sql`SELECT 1 FROM pt_clienti WHERE pt_userid = ${user.userId} AND cliente_userid = ${athleteId} AND attivo = 1`;
  if (!link.length) return c.json({ message: 'Atleta non trovato' }, 404);
  await sql`UPDATE utenti SET dieta_visibile = ${!!visible} WHERE utenteid = ${athleteId}`;
  return c.json({ utenteid: athleteId, dieta_visible: !!visible });
});

// Coach: mostra/nasconde la sezione forza/palestra a un singolo atleta (es. chi fa solo endurance)
app.put('/clients/:id{[0-9]+}/forza', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const athleteId = Number(c.req.param('id'));
  const { visible } = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const link = await sql`SELECT 1 FROM pt_clienti WHERE pt_userid = ${user.userId} AND cliente_userid = ${athleteId} AND attivo = 1`;
  if (!link.length) return c.json({ message: 'Atleta non trovato' }, 404);
  try {
    await sql`UPDATE utenti SET forza_visibile = ${!!visible} WHERE utenteid = ${athleteId}`;
  } catch (error) {
    if (/forza_visibile/.test(String(error?.message))) return c.json({ message: 'Va applicata la migrazione 20261203_forza_superserie.sql' }, 503);
    throw error;
  }
  return c.json({ utenteid: athleteId, forza_visible: !!visible });
});

// Coach: mostra/nasconde all'atleta le sezioni "Check fotografici" e "Valutazione corporea" (un solo interruttore)
app.put('/clients/:id{[0-9]+}/progressi', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const athleteId = Number(c.req.param('id'));
  const { visible } = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const link = await sql`SELECT 1 FROM pt_clienti WHERE pt_userid = ${user.userId} AND cliente_userid = ${athleteId} AND attivo = 1`;
  if (!link.length) return c.json({ message: 'Atleta non trovato' }, 404);
  try {
    await sql`UPDATE utenti SET progressi_visibile = ${!!visible} WHERE utenteid = ${athleteId}`;
  } catch (error) {
    if (/progressi_visibile/.test(String(error?.message))) return c.json({ message: 'Va applicata la migrazione 20261205_progressi_coach_assistant.sql' }, 503);
    throw error;
  }
  return c.json({ utenteid: athleteId, progressi_visible: !!visible });
});

// Coach: toggle visibility of endurance sections for themselves and their athletes
app.put('/me/endurance-settings', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { enabled } = await c.req.json();
  const sql = db(c.env);
  await sql`UPDATE utenti SET endurance_enabled = ${!!enabled} WHERE utenteid = ${user.userId}`;
  return c.json({ endurance_enabled: !!enabled });
});

app.put('/me/profile', async (c) => {
  const user = c.get('user');
  const { nome, cognome, pesokg, altezzacm, obiettivoallenamento, durataAllenamentoMinuti, giorniAllenamento, livellofitness, datanascita, sesso } = await c.req.json();
  const sql = db(c.env);
  if (nome?.trim()) await sql`UPDATE utenti SET nome = ${nome.trim()} WHERE utenteid = ${user.userId}`;
  if (cognome !== undefined) await sql`UPDATE utenti SET cognome = ${String(cognome || '').trim() || null} WHERE utenteid = ${user.userId}`;
  const rows = await sql`
    INSERT INTO profiloutente (utenteid, cognome, pesokg, altezzacm, obiettivoallenamento, durata_allenamento_minuti, giorni_allenamento, livellofitness, datanascita, sesso)
    VALUES (${user.userId}, ${cognome || null}, ${pesokg || null}, ${altezzacm || null}, ${obiettivoallenamento || null}, ${durataAllenamentoMinuti || null}, ${giorniAllenamento || null}, ${livellofitness || null}, ${datanascita || null}, ${sesso || null})
    ON CONFLICT (utenteid) DO UPDATE SET
      cognome = EXCLUDED.cognome, pesokg = EXCLUDED.pesokg, altezzacm = EXCLUDED.altezzacm,
      obiettivoallenamento = EXCLUDED.obiettivoallenamento, durata_allenamento_minuti = EXCLUDED.durata_allenamento_minuti,
      giorni_allenamento = EXCLUDED.giorni_allenamento, livellofitness = EXCLUDED.livellofitness
      , datanascita = EXCLUDED.datanascita, sesso = EXCLUDED.sesso
    RETURNING *
  `;
  if (user.ruolo === 'cliente') {
    // Single-coach app: auto-attach the athlete to the (unique) coach once they save their profile
    const coachRows = await sql`SELECT utenteid FROM utenti WHERE ruolo = 'personal_trainer' ORDER BY utenteid ASC LIMIT 1`;
    if (coachRows[0]) {
      await sql`
        INSERT INTO pt_clienti (pt_userid, cliente_userid, attivo)
        VALUES (${coachRows[0].utenteid}, ${user.userId}, 1)
        ON CONFLICT (pt_userid, cliente_userid) DO UPDATE SET attivo = 1
      `;
    }
  }
  return c.json(rows[0]);
});

// Coach: list assigned athletes (clients)
app.get('/clients', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`
        SELECT u.utenteid, u.nome, u.email, u.dataregistrazione, u.endurance_visibile, u.dieta_visibile,
          COALESCE(NULLIF(TRIM(u.cognome), ''), p.cognome) AS cognome, p.pesokg, p.altezzacm, p.obiettivoallenamento,
          p.durata_allenamento_minuti, p.giorni_allenamento, p.livellofitness
           , p.datanascita, p.sesso
    FROM pt_clienti pc
    JOIN utenti u ON u.utenteid = pc.cliente_userid
        LEFT JOIN profiloutente p ON p.utenteid = u.utenteid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1
    ORDER BY u.nome ASC, u.cognome ASC
  `;
  const fallback = rows.some((row) => row.endurance_visibile === null || row.endurance_visibile === undefined)
    ? await athleteEnduranceVisible(sql, {}) : true;
  let strength = new Map();
  try {
    const flags = await sql`SELECT utenteid, forza_visibile FROM utenti WHERE utenteid = ANY(${rows.map((row) => row.utenteid)})`;
    strength = new Map(flags.map((row) => [row.utenteid, row.forza_visibile !== false]));
  } catch { /* migrazione 20261203 non applicata */ }
  let progress = new Map();
  try {
    const flags = await sql`SELECT utenteid, progressi_visibile FROM utenti WHERE utenteid = ANY(${rows.map((row) => row.utenteid)})`;
    progress = new Map(flags.map((row) => [row.utenteid, row.progressi_visibile !== false]));
  } catch { /* migrazione 20261205 non applicata */ }
  return c.json(rows.map(({ endurance_visibile: visible, dieta_visibile: dietVisible, ...row }) => ({
    ...row, endurance_visible: visible === true || visible === false ? visible : fallback, dieta_visible: dietVisible !== false,
    forza_visible: strength.has(row.utenteid) ? strength.get(row.utenteid) : true,
    progressi_visible: progress.has(row.utenteid) ? progress.get(row.utenteid) : true,
  })));
});

// Coach: attach an existing athlete (by email) to their client list
app.post('/clients', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { email } = await c.req.json().catch(() => ({}));
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return c.json({ message: 'Scrivi l\'email con cui l\'atleta si è registrato' }, 400);

  const sql = db(c.env);
  // email confrontata senza maiuscole/spazi: "Mario.Rossi@Gmail.com " = "mario.rossi@gmail.com"
  const found = await sql`SELECT utenteid, TRIM(CONCAT_WS(' ', nome, cognome)) AS nome, ruolo FROM utenti WHERE LOWER(TRIM(email)) = ${clean} LIMIT 1`;
  const athlete = found[0];
  if (!athlete) return c.json({ message: 'Nessun account con questa email: l\'atleta deve prima registrarsi nell\'app' }, 404);
  if (athlete.ruolo !== 'cliente') return c.json({ message: 'Questa email appartiene a un coach, non a un atleta' }, 400);

  const existing = await sql`SELECT attivo FROM pt_clienti WHERE pt_userid = ${user.userId} AND cliente_userid = ${athlete.utenteid}`;
  if (existing[0]?.attivo === 1) return c.json({ message: `${athlete.nome} è già tra i tuoi atleti`, giaCollegato: true, utenteid: athlete.utenteid });
  await sql`
    INSERT INTO pt_clienti (pt_userid, cliente_userid, attivo)
    VALUES (${user.userId}, ${athlete.utenteid}, 1)
    ON CONFLICT (pt_userid, cliente_userid) DO UPDATE SET attivo = 1
  `;
  return c.json({ message: `${athlete.nome} aggiunto ai tuoi atleti`, utenteid: athlete.utenteid }, 201);
});

export default app;
