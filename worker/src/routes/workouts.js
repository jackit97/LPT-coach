import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { assertCoachOwnsAthlete } from '../utils.js';

const app = new Hono();
app.use('*', authenticate());
app.use('*', roleCheck('personal_trainer'));

async function getTemplate(sql, templateId, coachId) {
  const templates = await sql`
    SELECT * FROM workouttemplates WHERE templateid = ${templateId} AND ptuserid = ${coachId}
  `;
  if (!templates[0]) return null;
  const esercizi = await sql`
    SELECT * FROM workouttemplateexercises WHERE templateid = ${templateId} ORDER BY orderindex ASC, templateexerciseid ASC
  `;
  return { ...templates[0], esercizi };
}

app.get('/templates/mine', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const templates = await sql`
    SELECT * FROM workouttemplates WHERE ptuserid = ${user.userId} ORDER BY createdat DESC
  `;
  const fullTemplates = await Promise.all(templates.map((template) => getTemplate(sql, template.templateid, user.userId)));
  return c.json(fullTemplates.filter(Boolean));
});

app.post('/templates', async (c) => {
  const user = c.get('user');
  const { nomeTemplate, noteGenerali, esercizi = [] } = await c.req.json();
  if (!nomeTemplate?.trim()) return c.json({ message: 'nomeTemplate richiesto' }, 400);

  const sql = db(c.env);
  const templates = await sql`
    INSERT INTO workouttemplates (ptuserid, nometemplate, notegenerali)
    VALUES (${user.userId}, ${nomeTemplate.trim()}, ${noteGenerali || null})
    RETURNING *
  `;
  const template = templates[0];
  for (let index = 0; index < esercizi.length; index += 1) {
    const exercise = esercizi[index];
    if (!exercise?.nome) continue;
    await sql`
      INSERT INTO workouttemplateexercises
        (templateid, nomeesercizio, serie, ripetizioni, descrizione, videourl, recupero, orderindex)
      VALUES (${template.templateid}, ${exercise.nome}, ${exercise.serie || null}, ${exercise.ripetizioni || null},
        ${exercise.descrizione || null}, ${exercise.videoUrl || null}, ${exercise.recupero || null}, ${index})
    `;
  }
  return c.json(await getTemplate(sql, template.templateid, user.userId), 201);
});

app.put('/templates/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const { nomeTemplate, noteGenerali, esercizi } = await c.req.json();
  const sql = db(c.env);
  const existing = await getTemplate(sql, id, user.userId);
  if (!existing) return c.json({ message: 'Template non trovato' }, 404);

  await sql`
    UPDATE workouttemplates SET nometemplate = COALESCE(${nomeTemplate || null}, nometemplate),
      notegenerali = COALESCE(${noteGenerali ?? null}, notegenerali), updatedat = NOW()
    WHERE templateid = ${id}
  `;
  if (Array.isArray(esercizi)) {
    await sql`DELETE FROM workouttemplateexercises WHERE templateid = ${id}`;
    for (let index = 0; index < esercizi.length; index += 1) {
      const exercise = esercizi[index];
      if (!exercise?.nome) continue;
      await sql`
        INSERT INTO workouttemplateexercises
          (templateid, nomeesercizio, serie, ripetizioni, descrizione, videourl, recupero, orderindex)
        VALUES (${id}, ${exercise.nome}, ${exercise.serie || null}, ${exercise.ripetizioni || null},
          ${exercise.descrizione || null}, ${exercise.videoUrl || null}, ${exercise.recupero || null}, ${index})
      `;
    }
  }
  return c.json(await getTemplate(sql, id, user.userId));
});

app.post('/templates/:id/assign', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const { utenteId, data, titolo } = await c.req.json();
  if (!utenteId || !data) return c.json({ message: 'utenteId e data richiesti' }, 400);

  const sql = db(c.env);
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);
  const template = await getTemplate(sql, id, user.userId);
  if (!template) return c.json({ message: 'Template non trovato' }, 404);

  const workouts = await sql`
    INSERT INTO calendar_workouts (utenteid, coach_userid, data, tipo, titolo, descrizione, stato)
    VALUES (${utenteId}, ${user.userId}, ${data}, 'forza', ${titolo || template.nometemplate}, ${template.notegenerali || null}, 'pianificato')
    RETURNING *
  `;
  const workout = workouts[0];
  for (const exercise of template.esercizi) {
    await sql`
      INSERT INTO calendar_workout_exercises (workout_id, nome, serie, ripetizioni, recupero, note, video_url, order_index)
      VALUES (${workout.workout_id}, ${exercise.nomeesercizio}, ${exercise.serie}, ${exercise.ripetizioni},
        ${exercise.recupero}, ${exercise.descrizione}, ${exercise.videourl}, ${exercise.orderindex || 0})
    `;
  }
  return c.json(workout, 201);
});

app.delete('/templates/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const sql = db(c.env);
  const deleted = await sql`DELETE FROM workouttemplates WHERE templateid = ${id} AND ptuserid = ${user.userId} RETURNING templateid`;
  if (!deleted[0]) return c.json({ message: 'Template non trovato' }, 404);
  return c.json({ message: 'Eliminato' });
});

export default app;
