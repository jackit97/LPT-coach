import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { assertAccessToAthlete, assertCoachOwnsAthlete } from '../utils.js';
import { notify } from '../lib/notify.js';
import { ageFrom, compareAssessments, computeAssessment, normalizeSex, PROTOCOLS, SKINFOLDS, CIRCUMFERENCES } from '../lib/bodyComposition.js';

// Valutazione corporea: il coach inserisce pliche e circonferenze, l'atleta vede misure e stime.
const app = new Hono();
app.use('*', authenticate());

const isoDay = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10));
const parseJson = (text) => { try { return JSON.parse(text || '{}') || {}; } catch { return {}; } };
const positive = (value, max) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 10) / 10 : null;
};
const cleanMap = (input, fields, max) => Object.fromEntries(fields
  .map((field) => [field.key, positive(input?.[field.key], max)])
  .filter(([, value]) => value !== null));

function shape(row) {
  const base = {
    assessment_id: row.assessment_id, utenteid: row.utenteid, data: isoDay(row.data),
    sesso: row.sesso, eta: row.eta, peso_kg: row.peso_kg === null ? null : Number(row.peso_kg),
    altezza_cm: row.altezza_cm === null ? null : Number(row.altezza_cm), protocollo: row.protocollo,
    livello_attivita: row.livello_attivita === null ? null : Number(row.livello_attivita),
    obiettivo_bf: row.obiettivo_bf === null ? null : Number(row.obiettivo_bf),
    pliche: parseJson(row.pliche_json), circonferenze: parseJson(row.circonferenze_json), note: row.note || '',
    prossima_data: row.prossima_data ? isoDay(row.prossima_data) : null,
  };
  return { ...base, risultati: computeAssessment(base) };
}

async function profileOf(sql, userId) {
  const rows = await sql`
    SELECT u.nome, p.cognome, p.sesso, p.datanascita, p.altezzacm, p.pesokg
    FROM utenti u LEFT JOIN profiloutente p ON p.utenteid = u.utenteid WHERE u.utenteid = ${userId}
  `;
  const row = rows[0] || {};
  return {
    nome: [row.nome, row.cognome].filter(Boolean).join(' '),
    sesso: normalizeSex(row.sesso), eta: ageFrom(row.datanascita ? isoDay(row.datanascita) : null),
    datanascita: row.datanascita ? isoDay(row.datanascita) : null,
    altezza_cm: row.altezzacm ? Number(row.altezzacm) : null, peso_kg: row.pesokg ? Number(row.pesokg) : null,
  };
}

// GET /body?utenteId= — profilo di base + valutazioni (dalla piu' vecchia) con stime e differenze
app.get('/', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const utenteId = user.ruolo === 'cliente' ? user.userId : Number(c.req.query('utenteId'));
  if (!utenteId) return c.json({ message: 'utenteId richiesto' }, 400);
  if (!await assertAccessToAthlete(sql, user, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  if (user.ruolo === 'cliente') {
    let visible = true;
    try { visible = (await sql`SELECT progressi_visibile FROM utenti WHERE utenteid = ${utenteId}`)[0]?.progressi_visibile !== false; } catch { visible = true; }
    if (!visible) return c.json({ message: 'Sezione non disponibile' }, 403);
  }
  const rows = await sql`SELECT * FROM body_assessments WHERE utenteid = ${utenteId} ORDER BY data ASC, assessment_id ASC`;
  const list = rows.map(shape);
  list.forEach((item, index) => { item.confronto = index > 0 ? compareAssessments(item, list[index - 1]) : null; });
  return c.json({ profilo: await profileOf(sql, utenteId), valutazioni: list });
});

function payload(body) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(body.data || '')) ? body.data : null;
  const prossima = /^\d{4}-\d{2}-\d{2}$/.test(String(body.prossima_data || '')) && data && body.prossima_data > data ? body.prossima_data : null;
  const protocollo = PROTOCOLS.some((p) => p.key === body.protocollo) ? body.protocollo : 'jp7';
  const eta = Math.round(Number(body.eta));
  return {
    data,
    prossima_data: prossima,
    sesso: normalizeSex(body.sesso),
    eta: Number.isFinite(eta) && eta > 0 && eta < 120 ? eta : null,
    peso_kg: positive(body.peso_kg, 400),
    altezza_cm: positive(body.altezza_cm, 260),
    protocollo,
    livello_attivita: positive(body.livello_attivita, 2.5),
    obiettivo_bf: positive(body.obiettivo_bf, 60),
    pliche: JSON.stringify(cleanMap(body.pliche, SKINFOLDS, 100)),
    circonferenze: JSON.stringify(cleanMap(body.circonferenze, CIRCUMFERENCES, 250)),
    note: body.note ? String(body.note).slice(0, 2000) : null,
  };
}

// il peso e l'altezza dell'ultima valutazione aggiornano anche il profilo dell'atleta
async function syncProfile(sql, utenteId) {
  const last = (await sql`SELECT peso_kg, altezza_cm FROM body_assessments WHERE utenteid = ${utenteId} ORDER BY data DESC, assessment_id DESC LIMIT 1`)[0];
  if (!last || (!last.peso_kg && !last.altezza_cm)) return;
  try {
    await sql`
      INSERT INTO profiloutente (utenteid, pesokg, altezzacm) VALUES (${utenteId}, ${last.peso_kg}, ${last.altezza_cm ? Math.round(Number(last.altezza_cm)) : null})
      ON CONFLICT (utenteid) DO UPDATE SET pesokg = COALESCE(EXCLUDED.pesokg, profiloutente.pesokg), altezzacm = COALESCE(EXCLUDED.altezzacm, profiloutente.altezzacm)
    `;
  } catch (error) { console.error('Profilo non aggiornato:', error.message); }
}

async function saveNextDate(sql, row, date) {
  try { await sql`UPDATE body_assessments SET prossima_data = ${date} WHERE assessment_id = ${row.assessment_id}`; }
  catch (error) { console.error('prossima_data non salvata (migrazione 20261205?):', error.message); }
}

// POST /body { utenteId, data, ... }
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const body = await c.req.json().catch(() => ({}));
  const utenteId = Number(body.utenteId);
  if (!utenteId || !await assertCoachOwnsAthlete(sql, user.userId, utenteId)) return c.json({ message: 'Atleta non trovato' }, 404);
  const v = payload(body);
  if (!v.data) return c.json({ message: 'Indica la data della valutazione' }, 400);
  if (!v.peso_kg && v.pliche === '{}' && v.circonferenze === '{}') return c.json({ message: 'Inserisci almeno il peso, una plica o una circonferenza' }, 400);
  const rows = await sql`
    INSERT INTO body_assessments (utenteid, coach_userid, data, sesso, eta, peso_kg, altezza_cm, protocollo, livello_attivita, obiettivo_bf, pliche_json, circonferenze_json, note)
    VALUES (${utenteId}, ${user.userId}, ${v.data}, ${v.sesso}, ${v.eta}, ${v.peso_kg}, ${v.altezza_cm}, ${v.protocollo}, ${v.livello_attivita}, ${v.obiettivo_bf}, ${v.pliche}, ${v.circonferenze}, ${v.note})
    RETURNING *
  `;
  await saveNextDate(sql, rows[0], v.prossima_data);
  await syncProfile(sql, utenteId);
  await notify(sql, utenteId, {
    tipo: 'valutazione_corporea', mittenteId: user.userId,
    titolo: 'Nuova valutazione corporea',
    messaggio: 'Il coach ha registrato le tue misure: apri Valutazione corporea per vedere risultati e andamento.',
    link: { screen: 'BodyHome', params: { assessmentId: rows[0].assessment_id } },
  });
  return c.json(shape({ ...rows[0], prossima_data: v.prossima_data }), 201);
});

async function ownedAssessment(sql, user, id) {
  const row = (await sql`SELECT * FROM body_assessments WHERE assessment_id = ${id}`)[0];
  if (!row || !await assertCoachOwnsAthlete(sql, user.userId, row.utenteid)) return null;
  return row;
}

// PUT /body/:id
app.put('/:id{[0-9]+}', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const row = await ownedAssessment(sql, user, Number(c.req.param('id')));
  if (!row) return c.json({ message: 'Valutazione non trovata' }, 404);
  const v = payload(await c.req.json().catch(() => ({})));
  if (!v.data) return c.json({ message: 'Indica la data della valutazione' }, 400);
  const rows = await sql`
    UPDATE body_assessments SET data = ${v.data}, sesso = ${v.sesso}, eta = ${v.eta}, peso_kg = ${v.peso_kg}, altezza_cm = ${v.altezza_cm},
      protocollo = ${v.protocollo}, livello_attivita = ${v.livello_attivita}, obiettivo_bf = ${v.obiettivo_bf},
      pliche_json = ${v.pliche}, circonferenze_json = ${v.circonferenze}, note = ${v.note}, updated_at = NOW()
    WHERE assessment_id = ${row.assessment_id} RETURNING *
  `;
  await saveNextDate(sql, rows[0], v.prossima_data);
  await syncProfile(sql, row.utenteid);
  return c.json(shape({ ...rows[0], prossima_data: v.prossima_data }));
});

// DELETE /body/:id
app.delete('/:id{[0-9]+}', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const row = await ownedAssessment(sql, user, Number(c.req.param('id')));
  if (!row) return c.json({ message: 'Valutazione non trovata' }, 404);
  await sql`DELETE FROM body_assessments WHERE assessment_id = ${row.assessment_id}`;
  return c.json({ ok: true });
});

export default app;
