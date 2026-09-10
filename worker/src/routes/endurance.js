import { Hono } from 'hono';
import FitWriterPkg from '@markw65/fit-file-writer';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete } from '../utils.js';

const { FitWriter } = FitWriterPkg;
const app = new Hono();
app.use('*', authenticate());

const FIT_EPOCH_OFFSET = 631065600; // secondi tra epoch Unix (1970) e FIT (1989)

function parsePaceToSeconds(value) {
  const match = String(value || '').match(/(\d+):([0-5]\d)/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const numeric = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function encodeFitWorkout(workout, steps, paceZones = []) {
  const now = Math.floor(Date.now() / 1000) + FIT_EPOCH_OFFSET;
  const writer = new FitWriter();
  writer.writeMessage('file_id', {
    type: 'workout', manufacturer: 'garmin', product: 0,
    serial_number: 0, time_created: now, number: 0,
  });
  // Costruisce i messaggi FIT: ogni blocco con repeats>1 diventa gli step + un repeat_steps che li raggruppa
  const stepMessages = [];
  const fmtTime = (sec) => { const total = Math.round(sec); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };
  const buildStep = (step, index) => {
    const value = Number(String(step.value ?? step.meters ?? '').replace(',', '.')) || 0;
    const isDistance = step.unit === 'm' || step.unit === 'km';
    const durationMeters = isDistance ? (step.unit === 'km' ? value * 1000 : value) : 0;
    const zone = paceZones.find((item) => item.key === step.zone);
    const minSec = zone ? parsePaceToSeconds(zone.min) : null;
    const maxSec = zone ? parsePaceToSeconds(zone.max) : null;
    const intensity = step.type === 'Recupero' ? 'rest' : step.type === 'Riscaldamento' ? 'warmup' : step.type === 'Defaticamento' ? 'cooldown' : 'active';
    const typeName = step.type || `Step ${index + 1}`;
    const extent = isDistance
      ? (durationMeters >= 1000 ? `${(durationMeters / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 })}km` : `${Math.round(durationMeters)}m`)
      : fmtTime(parseStepSeconds(step));
    return {
      message_index: index,
      wkt_step_name: `${typeName} ${extent}`.slice(0, 63),
      intensity,
      ...(isDistance
        ? { duration_type: 'distance', duration_value: Math.round(durationMeters * 100) }
        : { duration_type: 'time', duration_value: Math.round(parseStepSeconds(step) * 1000) }),
      ...(minSec && maxSec
        ? { target_type: 'speed', target_value: 0, custom_target_value_low: Math.round((1000 / minSec) * 1000), custom_target_value_high: Math.round((1000 / maxSec) * 1000) }
        : { target_type: 'open', target_value: 0 }),
    };
  };

  steps.forEach((step) => {
    const children = (step.children || []).length ? step.children : [step];
    const times = Number(step.repeats) || 1;
    const fromIndex = stepMessages.length;
    children.forEach((child) => stepMessages.push(buildStep(child, stepMessages.length)));
    if (times > 1) {
      // Messaggio di ripetizione: ripete il blocco appena emesso "times" volte.
      // duration_type=6 (repeat_steps), duration_value=message_index di inizio blocco, target_value=conteggio
      stepMessages.push({
        message_index: stepMessages.length,
        duration_type: 6,
        duration_value: fromIndex,
        target_type: 'open',
        target_value: times,
        intensity: 'active',
      });
    }
  });

  writer.writeMessage('workout', {
    sport: 'running',
    num_valid_steps: stepMessages.length,
    wkt_name: String(workout.titolo || 'workout').slice(0, 63),
  });
  stepMessages.forEach((message) => writer.writeMessage('workout_step', message));
  const out = writer.finish();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

function parseStepSeconds(step) {
  const value = String(step.value ?? step.duration ?? '').trim();
  if (value.includes(':')) { const [minutes, seconds] = value.split(':').map(Number); return (minutes * 60) + seconds; }
  return Number(value.replace(',', '.')) * 60;
}

app.get('/workouts/:id/fit', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const workoutId = Number(c.req.param('id'));
  const rows = await sql`SELECT * FROM calendar_workouts WHERE workout_id = ${workoutId} AND tipo = 'endurance'`;
  const workout = rows[0];
  if (!workout || !await assertAccessToAthlete(sql, user, workout.utenteid)) return c.json({ message: 'Workout non trovato' }, 404);
  const session = workout.endurance_session_id ? (await sql`SELECT * FROM endurance_sessions WHERE session_id = ${workout.endurance_session_id}`)[0] : null;
  if (!session) return c.json({ message: 'Sessione endurance non trovata' }, 404);
  let steps = [];
  try { steps = JSON.parse(session.steps_json || '[]'); } catch { steps = []; }
  let paceZones = [];
  try {
    const zoneRows = await sql`SELECT zones FROM training_zone_sets WHERE athlete_id = ${workout.utenteid} AND is_active = true LIMIT 1`;
    const zones = zoneRows[0]?.zones;
    paceZones = Array.isArray(zones?.pace) ? zones.pace : [];
  } catch { paceZones = []; }
  const fit = encodeFitWorkout(workout, steps, paceZones);
  const filename = `${String(workout.titolo || 'lpt-workout').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'lpt-workout'}.fit`;
  return new Response(fit, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
});

app.post('/workouts', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { utenteId, date, title, zone, durationMinutes, durationSeconds, target, description, rpeTarget, stepsText, stepsJson } = await c.req.json();
  if (!utenteId || !date || !title || !durationMinutes) return c.json({ message: 'utenteId, date, title e durationMinutes sono richiesti' }, 400);
  const sql = db(c.env);
  let plans = await sql`SELECT plan_id FROM endurance_plans WHERE user_id = ${utenteId} AND is_active = 1 ORDER BY plan_id DESC LIMIT 1`;
  if (!plans[0]) {
    plans = await sql`
      INSERT INTO endurance_plans (user_id, title, block, start_date, end_date, weeks, is_active)
      VALUES (${utenteId}, 'Allenamenti endurance', 'workout', ${date}, ${date}, 1, 1) RETURNING plan_id
    `;
  }
  const inserted = await sql`
    INSERT INTO endurance_sessions (plan_id, "date", title, zone, duration_minutes, duration_seconds, target, description, rpe_target, steps_text, steps_json)
    VALUES (${plans[0].plan_id}, ${date}, ${title}, ${zone || null}, ${durationMinutes}, ${durationSeconds || null}, ${target || null},
            ${description || null}, ${rpeTarget || null}, ${stepsText || null}, ${stepsJson ? JSON.stringify(stepsJson) : null})
    RETURNING *
  `;
  const session = inserted[0];
  const workout = await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, rpe_pianificato, stato)
    VALUES (${utenteId}, ${user.userId}, ${session.session_id}, ${date}, 'endurance', ${title}, ${description || null}, ${durationMinutes}, ${durationSeconds || null}, ${rpeTarget || null}, 'pianificato')
    RETURNING *
  `;
  return c.json({ ...workout[0], session }, 201);
});

app.put('/workouts/:id', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const workoutId = Number(c.req.param('id'));
  const { date, title, zone, durationMinutes, durationSeconds, target, description, rpeTarget, stepsText, stepsJson } = await c.req.json();
  const sql = db(c.env);
  const rows = await sql`SELECT * FROM calendar_workouts WHERE workout_id = ${workoutId} AND tipo = 'endurance'`;
  const workout = rows[0];
  if (!workout) return c.json({ message: 'Allenamento endurance non trovato' }, 404);
  if (!await assertCoachOwnsAthlete(sql, user.userId, workout.utenteid)) return c.json({ message: 'Accesso negato' }, 403);
  const sessionRows = await sql`
    UPDATE endurance_sessions SET "date" = COALESCE(${date || null}, "date"), title = COALESCE(${title || null}, title),
      zone = COALESCE(${zone || null}, zone), duration_minutes = COALESCE(${durationMinutes || null}, duration_minutes), duration_seconds = COALESCE(${durationSeconds || null}, duration_seconds),
      target = COALESCE(${target ?? null}, target), description = COALESCE(${description ?? null}, description),
      rpe_target = COALESCE(${rpeTarget ?? null}, rpe_target), steps_text = COALESCE(${stepsText ?? null}, steps_text),
      steps_json = COALESCE(${stepsJson ? JSON.stringify(stepsJson) : null}, steps_json), updated_at = NOW()
    WHERE session_id = ${workout.endurance_session_id} RETURNING *
  `;
  const updated = await sql`
    UPDATE calendar_workouts SET data = COALESCE(${date || null}, data), titolo = COALESCE(${title || null}, titolo),
      descrizione = COALESCE(${description ?? null}, descrizione), durata_minuti = COALESCE(${durationMinutes || null}, durata_minuti), durata_secondi = COALESCE(${durationSeconds || null}, durata_secondi),
      rpe_pianificato = COALESCE(${rpeTarget ?? null}, rpe_pianificato), updated_at = NOW()
    WHERE workout_id = ${workoutId} RETURNING *
  `;
  return c.json({ ...updated[0], session: sessionRows[0] });
});

async function getEnduranceTemplate(sql, templateId, coachId) {
  const templates = await sql`
    SELECT * FROM endurance_plan_templates WHERE template_id = ${templateId} AND pt_user_id = ${coachId}
  `;
  if (!templates[0]) return null;
  const sessions = await sql`
    SELECT * FROM endurance_plan_template_sessions WHERE template_id = ${templateId}
    ORDER BY order_index ASC, template_session_id ASC
  `;
  return { ...templates[0], sessions };
}

app.get('/templates/mine', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const templates = await sql`
    SELECT * FROM endurance_plan_templates WHERE pt_user_id = ${user.userId} ORDER BY created_at DESC
  `;
  const full = await Promise.all(templates.map((template) => getEnduranceTemplate(sql, template.template_id, user.userId)));
  return c.json(full.filter(Boolean));
});

app.post('/templates', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { title, block, weeks, notes, sessions = [] } = await c.req.json();
  if (!title?.trim() || !block || !weeks) return c.json({ message: 'title, block e weeks sono richiesti' }, 400);
  const sql = db(c.env);
  const templates = await sql`
    INSERT INTO endurance_plan_templates (pt_user_id, title, block, weeks, notes)
    VALUES (${user.userId}, ${title.trim()}, ${block}, ${weeks}, ${notes || null}) RETURNING *
  `;
  const template = templates[0];
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index] || {};
    if (!session.title) continue;
    await sql`
      INSERT INTO endurance_plan_template_sessions
        (template_id, title, zone, duration_minutes, target, description, order_index, steps_text, rpe_target)
      VALUES (${template.template_id}, ${session.title}, ${session.zone || null}, ${session.durationMinutes || 0},
              ${session.target || null}, ${session.description || null}, ${index}, ${session.stepsText || null}, ${session.rpeTarget || null})
    `;
  }
  return c.json(await getEnduranceTemplate(sql, template.template_id, user.userId), 201);
});

// GET /endurance/plans?utenteId=
app.get('/plans', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { utenteId: qUtenteId } = c.req.query();
  const { utenteId, error } = resolveTargetUserId(user, qUtenteId);
  if (error) return c.json({ message: error }, 400);

  const ok = await assertAccessToAthlete(sql, user, utenteId);
  if (!ok) return c.json({ message: 'Accesso negato' }, 403);

  const rows = await sql`
    SELECT * FROM endurance_plans WHERE user_id = ${utenteId} ORDER BY start_date DESC
  `;
  return c.json(rows);
});

// GET /endurance/plans/:id - plan + sessions
app.get('/plans/:id', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const id = Number(c.req.param('id'));

  const rows = await sql`SELECT * FROM endurance_plans WHERE plan_id = ${id}`;
  const plan = rows[0];
  if (!plan) return c.json({ message: 'Piano non trovato' }, 404);

  const ok = await assertAccessToAthlete(sql, user, plan.user_id);
  if (!ok) return c.json({ message: 'Accesso negato' }, 403);

  const sessions = await sql`
    SELECT s.*, w.workout_id AS calendar_workout_id
    FROM endurance_sessions s
    LEFT JOIN calendar_workouts w ON w.endurance_session_id = s.session_id
    WHERE s.plan_id = ${id}
    ORDER BY s."date" ASC NULLS LAST, s.order_index ASC
  `;
  return c.json({ ...plan, sessions });
});

// POST /endurance/plans - coach creates a plan
app.post('/plans', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const { utenteId, title, block, startDate, endDate, weeks, weeklyVolumeMinutes, notes } = await c.req.json();
  if (!utenteId || !title || !block || !startDate || !endDate || !weeks) {
    return c.json({ message: 'Campi obbligatori mancanti' }, 400);
  }
  const inserted = await sql`
    INSERT INTO endurance_plans (user_id, title, block, start_date, end_date, weeks, weekly_volume_minutes, notes, is_active)
    VALUES (${utenteId}, ${title}, ${block}, ${startDate}, ${endDate}, ${weeks}, ${weeklyVolumeMinutes || null}, ${notes || null}, 1)
    RETURNING *
  `;
  return c.json(inserted[0]);
});

// POST /endurance/plans/:id/sessions - coach adds a session to a plan
app.post('/plans/:id/sessions', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const planId = Number(c.req.param('id'));
  const { date, title, zone, durationMinutes, target, description, rpeTarget, stepsText, stepsJson } = await c.req.json();
  if (!title || !durationMinutes) return c.json({ message: 'title e durationMinutes richiesti' }, 400);

  const inserted = await sql`
    INSERT INTO endurance_sessions (plan_id, "date", title, zone, duration_minutes, target, description, rpe_target, steps_text, steps_json)
        VALUES (${planId}, ${date || null}, ${title}, ${zone || null}, ${durationMinutes}, ${target || null},
          ${description || null}, ${rpeTarget || null}, ${stepsText || null}, ${stepsJson ? JSON.stringify(stepsJson) : null})
    RETURNING *
  `;

  const session = inserted[0];
  if (date) {
    await sql`
      INSERT INTO calendar_workouts
        (utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione, durata_minuti, rpe_pianificato, stato)
      SELECT p.user_id, ${c.get('user').userId}, ${session.session_id}, ${date}, 'endurance', ${title},
             ${description || null}, ${durationMinutes}, ${rpeTarget || null}, 'pianificato'
      FROM endurance_plans p
      WHERE p.plan_id = ${planId}
        AND NOT EXISTS (
          SELECT 1 FROM calendar_workouts w WHERE w.endurance_session_id = ${session.session_id}
        )
    `;
  }
  return c.json(session);
});

// POST /endurance/sessions/:id/checkin - athlete logs a completed session
app.post('/sessions/:id/checkin', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const sessionId = Number(c.req.param('id'));
  const { completed, performedDurationMinutes, distanceKm, rpe, avgHr, notes, feedback } = await c.req.json();

  const inserted = await sql`
    INSERT INTO endurance_checkins (session_id, user_id, completed, performed_duration_minutes, distance_km, rpe, avg_hr, notes, feedback)
    VALUES (${sessionId}, ${user.userId}, ${completed ? 1 : 0}, ${performedDurationMinutes || null}, ${distanceKm || null},
            ${rpe || null}, ${avgHr || null}, ${notes || null}, ${feedback || null})
    RETURNING *
  `;
  return c.json(inserted[0]);
});

export default app;
