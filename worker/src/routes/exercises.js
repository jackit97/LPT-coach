import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';

// Catalogo esercizi (tabella esercizifull): usato dagli editor, dalla libreria video e dalle schede.
const app = new Hono();
app.use('*', authenticate());

const cleanName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 150);

// GET /exercises?q= - ricerca per gli editor (id, nome)
app.get('/', async (c) => {
  const sql = db(c.env);
  const { q } = c.req.query();
  const search = `%${String(q || '').trim()}%`;
  const rows = await sql`
    SELECT esercizioid AS id, nomeesercizio AS nome
    FROM esercizifull
    WHERE nomeesercizio ILIKE ${search}
    ORDER BY nomeesercizio ASC
    LIMIT 100
  `;
  return c.json(rows);
});

// GET /exercises/catalog?q= - gestione catalogo (coach): con i video collegati
app.get('/catalog', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const search = `%${String(c.req.query('q') || '').trim()}%`;
  const rows = await sql`
    SELECT ef.esercizioid AS id, ef.nomeesercizio AS nome,
           COUNT(v.videoid)::int AS video_count,
           COALESCE(STRING_AGG(v.titolo, ', ' ORDER BY v.videoid DESC), '') AS video_titoli
    FROM esercizifull ef
    LEFT JOIN videotutorial v ON v.esercizioid = ef.esercizioid
    WHERE ef.nomeesercizio ILIKE ${search}
    GROUP BY ef.esercizioid, ef.nomeesercizio
    ORDER BY LOWER(ef.nomeesercizio) ASC
    LIMIT 1000
  `;
  return c.json(rows);
});

// POST /exercises { nome } - aggiunge un esercizio al catalogo (niente doppioni, maiuscole ignorate)
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const { nome } = await c.req.json();
  const name = cleanName(nome);
  if (!name) return c.json({ message: 'Inserisci il nome dell\'esercizio' }, 400);

  const sql = db(c.env);
  const existing = await sql`SELECT esercizioid AS id, nomeesercizio AS nome FROM esercizifull WHERE LOWER(TRIM(nomeesercizio)) = LOWER(${name}) LIMIT 1`;
  if (existing[0]) return c.json({ ...existing[0], message: `"${existing[0].nome}" è già nel catalogo` }, 409);
  const inserted = await sql`
    INSERT INTO esercizifull (nomeesercizio)
    VALUES (${name})
    RETURNING esercizioid AS id, nomeesercizio AS nome
  `;
  return c.json(inserted[0], 201);
});

// PUT /exercises/:id { nome } - rinomina. Aggiorna anche gli esercizi con il vecchio nome nelle schede,
// negli allenamenti e nei template del coach, cosi' i video restano collegati.
app.put('/:id{[0-9]+}', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const { nome } = await c.req.json();
  const name = cleanName(nome);
  if (!name) return c.json({ message: 'Inserisci il nome dell\'esercizio' }, 400);

  const sql = db(c.env);
  const current = await sql`SELECT nomeesercizio FROM esercizifull WHERE esercizioid = ${id}`;
  if (!current[0]) return c.json({ message: 'Esercizio non trovato' }, 404);
  const duplicate = await sql`SELECT esercizioid FROM esercizifull WHERE LOWER(TRIM(nomeesercizio)) = LOWER(${name}) AND esercizioid <> ${id} LIMIT 1`;
  if (duplicate[0]) return c.json({ message: `Esiste già un esercizio chiamato "${name}"` }, 409);

  const oldName = current[0].nomeesercizio;
  const rows = await sql`UPDATE esercizifull SET nomeesercizio = ${name} WHERE esercizioid = ${id} RETURNING esercizioid AS id, nomeesercizio AS nome`;
  if (oldName.trim().toLowerCase() !== name.toLowerCase()) {
    await sql`
      UPDATE esercizischeda e SET nomeesercizio = ${name}
      FROM schedeallenamento s JOIN pt_clienti pc ON pc.cliente_userid = s.utenteid AND pc.pt_userid = ${user.userId}
      WHERE e.schedaid = s.schedaid AND LOWER(TRIM(e.nomeesercizio)) = LOWER(TRIM(${oldName}))
    `;
    await sql`
      UPDATE calendar_workout_exercises x SET nome = ${name}
      FROM calendar_workouts w JOIN pt_clienti pc ON pc.cliente_userid = w.utenteid AND pc.pt_userid = ${user.userId}
      WHERE x.workout_id = w.workout_id AND LOWER(TRIM(x.nome)) = LOWER(TRIM(${oldName}))
    `;
    await sql`
      UPDATE workouttemplateexercises t SET nomeesercizio = ${name}
      FROM workouttemplates wt
      WHERE t.templateid = wt.templateid AND wt.ptuserid = ${user.userId} AND LOWER(TRIM(t.nomeesercizio)) = LOWER(TRIM(${oldName}))
    `;
  }
  return c.json(rows[0]);
});

// DELETE /exercises/:id - toglie l'esercizio dal catalogo; i video collegati restano ma vanno ricollegati.
// Le schede gia' assegnate non vengono toccate.
app.delete('/:id{[0-9]+}', roleCheck('personal_trainer'), async (c) => {
  const id = Number(c.req.param('id'));
  const sql = db(c.env);
  await sql`UPDATE videotutorial SET esercizioid = NULL WHERE esercizioid = ${id}`;
  const deleted = await sql`DELETE FROM esercizifull WHERE esercizioid = ${id} RETURNING esercizioid`;
  if (!deleted[0]) return c.json({ message: 'Esercizio non trovato' }, 404);
  return c.json({ message: 'Esercizio eliminato' });
});

export default app;
