import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { assertCoachOwnsAthlete } from '../utils.js';

const app = new Hono();
app.use('*', authenticate());

// GET /calendar?utenteId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Athletes only ever see their own workouts; coaches must pass utenteId.
app.get('/', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { from, to } = c.req.query();
  let { utenteId } = c.req.query();

  if (user.ruolo === 'cliente') {
    utenteId = user.userId;
  } else if (!utenteId) {
    return c.json({ message: 'utenteId richiesto per il coach' }, 400);
  } else {
    utenteId = Number(utenteId);
  }

  const fromDate = from || '1970-01-01';
  const toDate = to || '2999-12-31';

  const workouts = await sql`
    SELECT w.*, f.completato, f.rpe AS feedback_rpe, f.sensazione, f.durata_effettiva_minuti, f.note AS feedback_note
    FROM calendar_workouts w
    LEFT JOIN workout_feedback f ON f.workout_id = w.workout_id AND f.utenteid = w.utenteid
    WHERE w.utenteid = ${utenteId} AND w.data BETWEEN ${fromDate} AND ${toDate}
    ORDER BY w.data ASC, w.order_index ASC, w.workout_id ASC
  `;
  return c.json(workouts);
});

// GET /calendar/:id - full detail (exercises + feedback)
app.get('/:id', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const id = Number(c.req.param('id'));

  const rows = await sql`SELECT * FROM calendar_workouts WHERE workout_id = ${id}`;
  const workout = rows[0];
  if (!workout) return c.json({ message: 'Workout non trovato' }, 404);

  if (user.ruolo === 'cliente' && workout.utenteid !== user.userId) {
    return c.json({ message: 'Accesso negato' }, 403);
  }
  if (user.ruolo === 'personal_trainer' && workout.coach_userid !== user.userId) {
    const owns = await assertCoachOwnsAthlete(sql, user.userId, workout.utenteid);
    if (!owns) return c.json({ message: 'Accesso negato' }, 403);
  }

  const exercises = await sql`
    SELECT * FROM calendar_workout_exercises WHERE workout_id = ${id} ORDER BY order_index ASC, exercise_id ASC
  `;
  const feedback = await sql`
    SELECT * FROM workout_feedback WHERE workout_id = ${id} AND utenteid = ${workout.utenteid} LIMIT 1
  `;

  return c.json({ ...workout, esercizi: exercises, feedback: feedback[0] || null });
});

// POST /calendar - coach creates a workout for an athlete
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const body = await c.req.json();
  const { utenteId, data, tipo, titolo, descrizione, durataMinuti, rpePianificato, colore, esercizi } = body;

  if (!utenteId || !data || !titolo) {
    return c.json({ message: 'utenteId, data e titolo sono richiesti' }, 400);
  }

  const inserted = await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, rpe_pianificato, colore, stato)
    VALUES
      (${utenteId}, ${user.userId}, ${data}, ${tipo || 'forza'}, ${titolo}, ${descrizione || null},
       ${durataMinuti || null}, ${rpePianificato || null}, ${colore || null}, 'pianificato')
    RETURNING *
  `;
  const workout = inserted[0];

  if (Array.isArray(esercizi)) {
    for (let i = 0; i < esercizi.length; i += 1) {
      const ex = esercizi[i] || {};
      if (!ex.nome) continue;
      await sql`
        INSERT INTO calendar_workout_exercises
          (workout_id, nome, serie, ripetizioni, carico, recupero, note, video_url, order_index)
        VALUES
          (${workout.workout_id}, ${ex.nome}, ${ex.serie || null}, ${ex.ripetizioni || null}, ${ex.carico || null},
           ${ex.recupero || null}, ${ex.note || null}, ${ex.videoUrl || null}, ${i})
      `;
    }
  }

  return c.json(workout);
});

// PUT /calendar/:id - coach edits a workout
app.put('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const { data, tipo, titolo, descrizione, durataMinuti, rpePianificato, colore, stato } = body;

  const updated = await sql`
    UPDATE calendar_workouts SET
      data = COALESCE(${data || null}, data),
      tipo = COALESCE(${tipo || null}, tipo),
      titolo = COALESCE(${titolo || null}, titolo),
      descrizione = COALESCE(${descrizione ?? null}, descrizione),
      durata_minuti = COALESCE(${durataMinuti ?? null}, durata_minuti),
      rpe_pianificato = COALESCE(${rpePianificato ?? null}, rpe_pianificato),
      colore = COALESCE(${colore ?? null}, colore),
      stato = COALESCE(${stato || null}, stato),
      updated_at = NOW()
    WHERE workout_id = ${id}
    RETURNING *
  `;
  if (!updated[0]) return c.json({ message: 'Workout non trovato' }, 404);
  return c.json(updated[0]);
});

// DELETE /calendar/:id
app.delete('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  await sql`DELETE FROM calendar_workouts WHERE workout_id = ${id}`;
  return c.json({ message: 'Eliminato' });
});

// Replace the exercise list of a workout (coach)
app.put('/:id/exercises', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const { esercizi } = await c.req.json();
  if (!Array.isArray(esercizi)) return c.json({ message: 'esercizi deve essere un array' }, 400);

  await sql`DELETE FROM calendar_workout_exercises WHERE workout_id = ${id}`;
  for (let i = 0; i < esercizi.length; i += 1) {
    const ex = esercizi[i] || {};
    if (!ex.nome) continue;
    await sql`
      INSERT INTO calendar_workout_exercises
        (workout_id, nome, serie, ripetizioni, carico, recupero, note, video_url, order_index)
      VALUES
        (${id}, ${ex.nome}, ${ex.serie || null}, ${ex.ripetizioni || null}, ${ex.carico || null},
         ${ex.recupero || null}, ${ex.note || null}, ${ex.videoUrl || null}, ${i})
    `;
  }
  const rows = await sql`SELECT * FROM calendar_workout_exercises WHERE workout_id = ${id} ORDER BY order_index ASC`;
  return c.json(rows);
});

// POST /calendar/:id/feedback - athlete leaves feedback on their own workout
app.post('/:id/feedback', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const { completato, rpe, sensazione, durataEffettivaMinuti, note } = await c.req.json();

  const workoutRows = await sql`SELECT * FROM calendar_workouts WHERE workout_id = ${id}`;
  const workout = workoutRows[0];
  if (!workout) return c.json({ message: 'Workout non trovato' }, 404);
  if (workout.utenteid !== user.userId) return c.json({ message: 'Accesso negato' }, 403);

  const upserted = await sql`
    INSERT INTO workout_feedback (workout_id, utenteid, completato, rpe, sensazione, durata_effettiva_minuti, note)
    VALUES (${id}, ${user.userId}, ${completato ? 1 : 0}, ${rpe || null}, ${sensazione || null},
            ${durataEffettivaMinuti || null}, ${note || null})
    ON CONFLICT (workout_id, utenteid) DO UPDATE SET
      completato = EXCLUDED.completato,
      rpe = EXCLUDED.rpe,
      sensazione = EXCLUDED.sensazione,
      durata_effettiva_minuti = EXCLUDED.durata_effettiva_minuti,
      note = EXCLUDED.note,
      updated_at = NOW()
    RETURNING *
  `;

  await sql`
    UPDATE calendar_workouts SET stato = ${completato ? 'completato' : 'saltato'}, updated_at = NOW()
    WHERE workout_id = ${id}
  `;

  return c.json(upserted[0]);
});

export default app;
