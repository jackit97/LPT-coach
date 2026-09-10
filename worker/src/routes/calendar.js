import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { assertCoachOwnsAthlete } from '../utils.js';

const app = new Hono();
app.use('*', authenticate());

app.post('/functional', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { utenteId, data, titolo, descrizione, durataMinuti, esercizi = [] } = await c.req.json();
  if (!utenteId || !data || !titolo) return c.json({ message: 'utenteId, data e titolo sono richiesti' }, 400);
  const sql = db(c.env);
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);
  const inserted = await sql`
    INSERT INTO calendar_workouts (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, stato)
    VALUES (${utenteId}, ${user.userId}, ${data}, 'funzionale', ${titolo}, ${descrizione || null}, ${durataMinuti || null}, 'pianificato')
    RETURNING *
  `;
  for (let index = 0; index < esercizi.length; index += 1) {
    const exercise = esercizi[index];
    if (!exercise?.nome) continue;
    await sql`
      INSERT INTO calendar_workout_exercises (workout_id, nome, ripetizioni, carico, note, order_index)
      VALUES (${inserted[0].workout_id}, ${exercise.nome}, ${exercise.ripetizioni || null}, ${exercise.carico || null}, ${exercise.note || null}, ${index})
    `;
  }
  return c.json(inserted[0], 201);
});

async function syncSourceWorkouts(sql, utenteId, includeStrength) {
  if (includeStrength) await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, schedaid, data, tipo, titolo, descrizione, stato)
    SELECT s.utenteid, NULL, s.schedaid, scheduled_date, 'forza',
           COALESCE(NULLIF(TRIM(s.nomescheda), ''), 'Allenamento pesi'),
           s.notegenerali, 'pianificato'
    FROM schedeallenamento s
    CROSS JOIN LATERAL generate_series(
      s.datainizio,
      COALESCE(s.datafine, s.datainizio),
      INTERVAL '7 days'
    ) AS occurrences(scheduled_date)
    WHERE s.utenteid = ${utenteId}
      AND s.datainizio IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM calendar_workouts w
        WHERE w.schedaid = s.schedaid AND w.data = s.datainizio
      )
  `;

  if (includeStrength) await sql`
    INSERT INTO calendar_workout_exercises
      (workout_id, nome, serie, ripetizioni, note, video_url, recupero, order_index)
    SELECT w.workout_id, e.nomeesercizio, e.serie, e.ripetizioni, e.noteutente, e.videourl,
           e.recupero, ROW_NUMBER() OVER (PARTITION BY w.workout_id ORDER BY e.esercizioid) - 1
    FROM calendar_workouts w
    JOIN esercizischeda e ON e.schedaid = w.schedaid
    WHERE w.utenteid = ${utenteId}
      AND w.tipo = 'forza'
      AND NOT EXISTS (
        SELECT 1 FROM calendar_workout_exercises x
        WHERE x.workout_id = w.workout_id
      )
  `;

    await sql`
      UPDATE calendar_workout_exercises x
      SET note = COALESCE(NULLIF(x.note, ''), NULLIF(e.descrizione, ''), NULLIF(e.noteutente, '')),
          video_url = COALESCE(x.video_url, e.videourl),
          recupero = COALESCE(x.recupero, e.recupero)
      FROM calendar_workouts w, esercizischeda e
      WHERE x.workout_id = w.workout_id AND w.schedaid = e.schedaid
        AND e.nomeesercizio = x.nome AND w.utenteid = ${utenteId} AND w.tipo = 'forza'
    `;

  await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, rpe_pianificato, stato)
    SELECT p.user_id, NULL, s.session_id,
           COALESCE(
             s."date"::date,
             p.start_date::date + (
               (ROW_NUMBER() OVER (PARTITION BY p.plan_id ORDER BY s.session_id) - 1) * 7
             )::int
           ),
           'endurance', s.title, s.description, s.duration_minutes, s.duration_seconds, s.rpe_target, 'pianificato'
    FROM endurance_sessions s
    JOIN endurance_plans p ON p.plan_id = s.plan_id
    WHERE p.user_id = ${utenteId}
      AND NOT EXISTS (
        SELECT 1 FROM calendar_workouts w WHERE w.endurance_session_id = s.session_id
      )
  `;
}

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

  await syncSourceWorkouts(sql, utenteId, true);

  const workouts = await sql`
    SELECT w.*, f.completato, f.rpe AS feedback_rpe, f.sensazione, f.durata_effettiva_minuti, f.note AS feedback_note
    FROM calendar_workouts w
    LEFT JOIN workout_feedback f ON f.workout_id = w.workout_id AND f.utenteid = w.utenteid
    WHERE w.utenteid = ${utenteId} AND w.data BETWEEN ${fromDate} AND ${toDate}
      AND (${user.ruolo === 'cliente'} OR w.utenteid = ${utenteId})
    ORDER BY w.data ASC, w.order_index ASC, w.workout_id ASC
  `;
  const events = await sql`
        SELECT -dietaid AS workout_id, utenteid, ${user.userId} AS coach_userid,
          datafine AS data,
           'scadenza_dieta' AS tipo, COALESCE(nome, 'Dieta') AS titolo,
           CONCAT('Dieta valida dal ', datainizio, ' al ', COALESCE(datafine::text, '')) AS descrizione,
           NULL::int AS durata_minuti, 'pianificato' AS stato
    FROM diete
        WHERE utenteid = ${utenteId} AND ${user.ruolo === 'personal_trainer'}
          AND datafine BETWEEN ${fromDate} AND ${toDate}
    UNION ALL
    SELECT -100000 - schedaid AS workout_id, utenteid, ${user.userId} AS coach_userid,
           datafine AS data, 'scadenza_scheda' AS tipo,
           CONCAT(COALESCE(split_part(nomescheda, ' - Giorno ', 1), 'Scheda palestra'), ' - Scadenza') AS titolo,
           CONCAT('Scheda valida dal ', COALESCE(datainizio::text, ''), ' al ', COALESCE(datafine::text, '')) AS descrizione,
           NULL::int AS durata_minuti, 'pianificato' AS stato
    FROM (SELECT DISTINCT ON (utenteid, split_part(nomescheda, ' - Giorno ', 1)) *
          FROM schedeallenamento
          WHERE utenteid = ${utenteId} AND datafine IS NOT NULL AND ${user.ruolo === 'personal_trainer'}
            AND datafine BETWEEN ${fromDate} AND ${toDate}
          ORDER BY utenteid, split_part(nomescheda, ' - Giorno ', 1), datafine DESC, schedaid DESC) sheets
    UNION ALL
    SELECT -200000 - pagamentoid AS workout_id, utenteid, ${user.userId} AS coach_userid,
           scadenza AS data, 'pagamento' AS tipo,
           COALESCE(causale, 'Pagamento in scadenza') AS titolo,
           CONCAT('Importo: ', importo, ' · Stato: ', COALESCE(stato, 'In sospeso')) AS descrizione,
           NULL::int AS durata_minuti, 'pianificato' AS stato
    FROM pagamenti
    WHERE utenteid = ${utenteId} AND scadenza BETWEEN ${fromDate} AND ${toDate}
      AND ${user.ruolo === 'personal_trainer'}
  `;
  return c.json([...workouts, ...events].sort((left, right) => String(left.data).localeCompare(String(right.data))));
});

app.get('/strength-sheets', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  let { utenteId } = c.req.query();
  if (user.ruolo === 'cliente') utenteId = user.userId;
  if (!utenteId) return c.json({ message: 'utenteId richiesto' }, 400);
  utenteId = Number(utenteId);
  if (user.ruolo === 'personal_trainer' && !await assertCoachOwnsAthlete(sql, user.userId, utenteId)) return c.json({ message: 'Accesso negato' }, 403);

  const rows = await sql`
    SELECT s.*, e.esercizioid AS catalog_exercise_id, e.nomeesercizio, e.serie, e.ripetizioni,
           e.descrizione AS exercise_description, e.recupero, e.noteutente, e.videourl AS legacy_video_url,
           v.videoid, v.titolo AS video_title, v.videourl AS catalog_video_url
    FROM schedeallenamento s
    LEFT JOIN esercizischeda e ON e.schedaid = s.schedaid
    LEFT JOIN esercizifull ef ON ef.nomeesercizio = e.nomeesercizio
    LEFT JOIN videotutorial v ON v.esercizioid = ef.esercizioid
    WHERE s.utenteid = ${utenteId}
    ORDER BY s.datainizio ASC NULLS LAST, s.schedaid ASC, e.esercizioid ASC, v.videoid ASC
  `;
  const groups = new Map();
  for (const row of rows) {
    const match = String(row.nomescheda || '').match(/^(.*?)(?:\s+-\s+Giorno\s+([A-Za-z0-9]+))?$/i);
    const name = (match?.[1] || row.nomescheda || 'Scheda palestra').trim();
    if (!groups.has(name)) groups.set(name, { nome: name, datainizio: row.datainizio, datafine: row.datafine, giorni: new Map() });
    const group = groups.get(name);
    const dayName = match?.[2] ? `Giorno ${match[2]}` : 'Giorno 1';
    if (!group.giorni.has(row.schedaid)) group.giorni.set(row.schedaid, { schedaid: row.schedaid, nome: dayName, data: row.datainizio, esercizi: [] });
    if (row.nomeesercizio && !group.giorni.get(row.schedaid).esercizi.some((exercise) => exercise.esercizioid === row.esercizioid)) {
      group.giorni.get(row.schedaid).esercizi.push({
        esercizioid: row.esercizioid, nome: row.nomeesercizio, serie: row.serie, ripetizioni: row.ripetizioni,
        descrizione: row.exercise_description, recupero: row.recupero, note: row.noteutente,
        video_url: row.legacy_video_url || row.catalog_video_url, video_title: row.video_title,
      });
    }
  }
  return c.json([...groups.values()].map((group) => ({ ...group, giorni: [...group.giorni.values()] })));
});

app.post('/strength-sheets', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { utenteId, nome, dataInizio, datafine, giorni = [] } = await c.req.json();
  if (!utenteId || !nome?.trim() || !dataInizio || !datafine || datafine < dataInizio || !Array.isArray(giorni) || !giorni.length || giorni.length > 7) {
    return c.json({ message: 'Nome, data inizio, data scadenza e da 1 a 7 giorni sono richiesti' }, 400);
  }
  const sql = db(c.env);
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);
  const created = [];
  for (let index = 0; index < giorni.length; index += 1) {
    const day = giorni[index] || {};
    if (!day.data) continue;
    const sheet = await sql`
      INSERT INTO schedeallenamento (utenteid, nomescheda, datainizio, datafine, attiva, notegenerali)
      VALUES (${utenteId}, ${`${nome.trim()} - Giorno ${index + 1}`}, ${day.data || dataInizio}, ${datafine}, 1, ${day.note || null})
      RETURNING *
    `;
    const sheetRow = sheet[0];
    for (const exercise of Array.isArray(day.esercizi) ? day.esercizi : []) {
      if (!exercise?.nome) continue;
      await sql`
        INSERT INTO esercizischeda (schedaid, nomeesercizio, serie, ripetizioni, descrizione, recupero, noteutente, videourl)
        VALUES (${sheetRow.schedaid}, ${exercise.nome}, ${exercise.serie || null}, ${exercise.ripetizioni || null},
                ${exercise.descrizione || null}, ${exercise.recupero || null}, ${exercise.note || null}, ${exercise.videoUrl || null})
      `;
    }
    created.push(sheetRow);
  }
  return c.json({ nome: nome.trim(), giorni: created }, 201);
});

app.delete('/strength-sheets/:id', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const rows = await sql`SELECT utenteid FROM schedeallenamento WHERE schedaid = ${id}`;
  if (!rows[0] || !await assertCoachOwnsAthlete(sql, user.userId, rows[0].utenteid)) return c.json({ message: 'Accesso negato' }, 403);
  const deleted = await sql`DELETE FROM schedeallenamento WHERE schedaid = ${id} RETURNING schedaid`;
  if (!deleted[0]) return c.json({ message: 'Scheda non trovata' }, 404);
  return c.json({ message: 'Scheda eliminata' });
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
  const endurance = workout.endurance_session_id
    ? (await sql`SELECT * FROM endurance_sessions WHERE session_id = ${workout.endurance_session_id} LIMIT 1`)[0] || null
    : null;
  const scheda = workout.schedaid
    ? (await sql`SELECT * FROM schedeallenamento WHERE schedaid = ${workout.schedaid} LIMIT 1`)[0] || null
    : null;

  return c.json({ ...workout, esercizi: exercises, feedback: feedback[0] || null, endurance, scheda });
});

// POST /calendar - coach creates a workout for an athlete
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const body = await c.req.json();
  const { utenteId, data, tipo, titolo, descrizione, durataMinuti, rpePianificato, colore, esercizi, testResult, testUnit } = body;

  if (!utenteId || !data || !titolo) {
    return c.json({ message: 'utenteId, data e titolo sono richiesti' }, 400);
  }

  const workoutDescription = tipo === 'test' && testResult
    ? `${descrizione || ''}\nRisultato: ${testResult}${testUnit ? ` ${testUnit}` : ''}`.trim()
    : descrizione;

  const inserted = await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, rpe_pianificato, colore, stato)
    VALUES
      (${utenteId}, ${user.userId}, ${data}, ${tipo || 'forza'}, ${titolo}, ${workoutDescription || null},
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
  const { data, tipo, titolo, descrizione, durataMinuti, rpePianificato, colore, stato, testResult, testUnit } = body;

  const updated = await sql`
    UPDATE calendar_workouts SET
      data = COALESCE(${data || null}, data),
      tipo = COALESCE(${tipo || null}, tipo),
      titolo = COALESCE(${titolo || null}, titolo),
      descrizione = COALESCE(${tipo === 'test' && testResult ? `${descrizione || ''}\nRisultato: ${testResult}${testUnit ? ` ${testUnit}` : ''}` : descrizione ?? null}, descrizione),
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
