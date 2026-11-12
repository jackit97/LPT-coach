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

async function loadWorkoutSnapshot(sql, workoutId, coachId) {
  const rows = await sql`SELECT * FROM calendar_workouts WHERE workout_id = ${workoutId}`;
  const workout = rows[0];
  if (!workout || !await assertCoachOwnsAthlete(sql, coachId, workout.utenteid)) return null;
  const esercizi = await sql`
    SELECT * FROM calendar_workout_exercises WHERE workout_id = ${workoutId} ORDER BY order_index ASC, exercise_id ASC
  `;
  const endurance = workout.endurance_session_id
    ? (await sql`SELECT * FROM endurance_sessions WHERE session_id = ${workout.endurance_session_id}`)[0] || null
    : null;
  return { workout, esercizi, endurance };
}

// Creates a calendar workout (plus exercises / endurance session) from a normalized snapshot.
async function insertWorkoutFromSnapshot(sql, coachId, utenteId, data, snap) {
  let sessionId = null;
  if (snap.endurance) {
    const e = snap.endurance;
    let plans = await sql`SELECT plan_id FROM endurance_plans WHERE user_id = ${utenteId} AND is_active = 1 ORDER BY plan_id DESC LIMIT 1`;
    if (!plans[0]) {
      plans = await sql`
        INSERT INTO endurance_plans (user_id, title, block, start_date, end_date, weeks, is_active)
        VALUES (${utenteId}, 'Allenamenti endurance', 'workout', ${data}, ${data}, 1, 1) RETURNING plan_id
      `;
    }
    const sessions = await sql`
      INSERT INTO endurance_sessions (plan_id, "date", title, zone, duration_minutes, duration_seconds, target, description, rpe_target, steps_text, steps_json)
      VALUES (${plans[0].plan_id}, ${data}, ${snap.titolo}, ${e.zone || null}, ${e.duration_minutes || snap.durataMinuti || 0}, ${e.duration_seconds || null},
        ${e.target || null}, ${e.description || null}, ${e.rpe_target || null}, ${e.steps_text || null}, ${e.steps_json || null})
      RETURNING session_id
    `;
    sessionId = sessions[0].session_id;
  }
  const workouts = await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, rpe_pianificato, colore, stato)
    VALUES (${utenteId}, ${coachId}, ${sessionId}, ${data}, ${snap.tipo || 'forza'}, ${snap.titolo}, ${snap.descrizione || null},
      ${snap.durataMinuti || null}, ${snap.durataSecondi || null}, ${snap.rpe || null}, ${snap.colore || null}, 'pianificato')
    RETURNING *
  `;
  const workout = workouts[0];
  for (let i = 0; i < (snap.esercizi || []).length; i += 1) {
    const ex = snap.esercizi[i];
    await sql`
      INSERT INTO calendar_workout_exercises (workout_id, nome, serie, ripetizioni, carico, recupero, note, video_url, order_index)
      VALUES (${workout.workout_id}, ${ex.nome}, ${ex.serie || null}, ${ex.ripetizioni || null}, ${ex.carico || null},
        ${ex.recupero || null}, ${ex.note || null}, ${ex.video_url || null}, ${i})
    `;
  }
  return workout;
}

app.post('/duplicate/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const { data, utenteId } = await c.req.json();
  if (!data) return c.json({ message: 'data richiesta' }, 400);

  const sql = db(c.env);
  const snap = await loadWorkoutSnapshot(sql, id, user.userId);
  if (!snap) return c.json({ message: 'Workout non trovato' }, 404);
  const targetId = Number(utenteId || snap.workout.utenteid);
  if (!await assertCoachOwnsAthlete(sql, user.userId, targetId)) return c.json({ message: 'Accesso negato' }, 403);

  const w = snap.workout;
  const created = await insertWorkoutFromSnapshot(sql, user.userId, targetId, data, {
    tipo: w.tipo, titolo: w.titolo, descrizione: w.descrizione, durataMinuti: w.durata_minuti,
    durataSecondi: w.durata_secondi, rpe: w.rpe_pianificato, colore: w.colore,
    esercizi: snap.esercizi, endurance: snap.endurance,
  });
  return c.json(created, 201);
});

app.post('/templates/from-workout/:id', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const { nomeTemplate } = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const snap = await loadWorkoutSnapshot(sql, id, user.userId);
  if (!snap) return c.json({ message: 'Workout non trovato' }, 404);

  const w = snap.workout;
  const enduranceJson = snap.endurance ? JSON.stringify({
    zone: snap.endurance.zone, target: snap.endurance.target, description: snap.endurance.description,
    rpe_target: snap.endurance.rpe_target, steps_text: snap.endurance.steps_text, steps_json: snap.endurance.steps_json,
    duration_minutes: snap.endurance.duration_minutes, duration_seconds: snap.endurance.duration_seconds,
  }) : null;
  const templates = await sql`
    INSERT INTO workouttemplates (ptuserid, nometemplate, notegenerali, tipo, durata_minuti, durata_secondi, endurance_json)
    VALUES (${user.userId}, ${(nomeTemplate || w.titolo).trim()}, ${w.descrizione || null}, ${w.tipo || 'forza'},
      ${w.durata_minuti || null}, ${w.durata_secondi || null}, ${enduranceJson})
    RETURNING templateid
  `;
  const templateId = templates[0].templateid;
  for (let i = 0; i < snap.esercizi.length; i += 1) {
    const ex = snap.esercizi[i];
    await sql`
      INSERT INTO workouttemplateexercises
        (templateid, nomeesercizio, serie, ripetizioni, descrizione, videourl, recupero, carico, orderindex)
      VALUES (${templateId}, ${ex.nome}, ${ex.serie || null}, ${ex.ripetizioni || null}, ${ex.note || null},
        ${ex.video_url || null}, ${ex.recupero || null}, ${ex.carico || null}, ${i})
    `;
  }
  return c.json(await getTemplate(sql, templateId, user.userId), 201);
});

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

  let endurance = null;
  if (template.endurance_json) {
    try { endurance = JSON.parse(template.endurance_json); } catch { endurance = null; }
  }
  const workout = await insertWorkoutFromSnapshot(sql, user.userId, Number(utenteId), data, {
    tipo: template.tipo || 'forza',
    titolo: titolo || template.nometemplate,
    descrizione: template.notegenerali,
    durataMinuti: template.durata_minuti,
    durataSecondi: template.durata_secondi,
    esercizi: template.esercizi.map((e) => ({
      nome: e.nomeesercizio, serie: e.serie, ripetizioni: e.ripetizioni, carico: e.carico,
      recupero: e.recupero, note: e.descrizione, video_url: e.videourl,
    })),
    endurance,
  });
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
