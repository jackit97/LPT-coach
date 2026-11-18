import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';

const app = new Hono();
app.use('*', authenticate());

// GET /videos - libreria video, solo per il coach. Gli atleti vedono i video solo dentro le schede
// (l'URL arriva insieme all'esercizio da /calendar/strength-sheets e /calendar/:id).
app.get('/', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const rows = await sql`
    SELECT v.*, ef.nomeesercizio AS esercizio_nome
    FROM videotutorial v LEFT JOIN esercizifull ef ON ef.esercizioid = v.esercizioid
    ORDER BY v.datacaricamento DESC
  `;
  return c.json(rows);
});

// Esercizio del catalogo da collegare: per id, oppure per nome (creato se non esiste)
async function resolveExercise(sql, esercizioId, esercizioNome) {
  if (esercizioId) {
    const rows = await sql`SELECT esercizioid, nomeesercizio FROM esercizifull WHERE esercizioid = ${Number(esercizioId)}`;
    return rows[0] || null;
  }
  const name = String(esercizioNome || '').trim();
  if (!name) return null;
  const existing = await sql`SELECT esercizioid, nomeesercizio FROM esercizifull WHERE LOWER(TRIM(nomeesercizio)) = LOWER(${name}) LIMIT 1`;
  if (existing[0]) return existing[0];
  const created = await sql`INSERT INTO esercizifull (nomeesercizio) VALUES (${name}) RETURNING esercizioid, nomeesercizio`;
  return created[0];
}

// POST /videos - coach adds a tutorial (external URL, e.g. YouTube/Vimeo/CDN link)
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { titolo, descrizione, videourl, esercizioId, esercizioNome } = await c.req.json();
  const exercise = await resolveExercise(sql, esercizioId, esercizioNome);
  const title = String(titolo || exercise?.nomeesercizio || '').trim();
  if (!title || !videourl) return c.json({ message: 'Esercizio (o titolo) e link del video sono richiesti' }, 400);

  const inserted = await sql`
    INSERT INTO videotutorial (titolo, esercizioid, descrizione, videourl, creatodaid)
    VALUES (${title}, ${exercise?.esercizioid || null}, ${descrizione || null}, ${videourl}, ${user.userId})
    RETURNING *
  `;
  return c.json({ ...inserted[0], esercizio_nome: exercise?.nomeesercizio || null });
});

// PUT /videos/:id - modifica titolo, descrizione, link o esercizio collegato
app.put('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const exercise = (body.esercizioId || body.esercizioNome) ? await resolveExercise(sql, body.esercizioId, body.esercizioNome) : null;
  const rows = await sql`
    UPDATE videotutorial SET
      titolo = COALESCE(${body.titolo || null}, titolo),
      descrizione = COALESCE(${body.descrizione ?? null}, descrizione),
      videourl = COALESCE(${body.videourl || null}, videourl),
      esercizioid = CASE WHEN ${body.scollega === true} THEN NULL ELSE COALESCE(${exercise?.esercizioid || null}::int, esercizioid) END
    WHERE videoid = ${id}
    RETURNING *
  `;
  if (!rows[0]) return c.json({ message: 'Video non trovato' }, 404);
  return c.json(rows[0]);
});

// DELETE /videos/:id
app.delete('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  await sql`DELETE FROM videotutorial WHERE videoid = ${id}`;
  return c.json({ message: 'Eliminato' });
});

export default app;
