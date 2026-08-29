import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete } from '../utils.js';

const app = new Hono();
app.use('*', authenticate());

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
    SELECT * FROM endurance_sessions WHERE plan_id = ${id} ORDER BY "date" ASC NULLS LAST, order_index ASC
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
  const { date, title, zone, durationMinutes, target, description, rpeTarget } = await c.req.json();
  if (!title || !durationMinutes) return c.json({ message: 'title e durationMinutes richiesti' }, 400);

  const inserted = await sql`
    INSERT INTO endurance_sessions (plan_id, "date", title, zone, duration_minutes, target, description, rpe_target)
    VALUES (${planId}, ${date || null}, ${title}, ${zone || null}, ${durationMinutes}, ${target || null},
            ${description || null}, ${rpeTarget || null})
    RETURNING *
  `;
  return c.json(inserted[0]);
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
