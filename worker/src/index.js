import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import calendarRoutes from './routes/calendar.js';
import dietsRoutes from './routes/diets.js';
import paymentsRoutes from './routes/payments.js';
import enduranceRoutes from './routes/endurance.js';
import videosRoutes from './routes/videos.js';
import exercisesRoutes from './routes/exercises.js';
import workoutsRoutes from './routes/workouts.js';
import ptRoutes from './routes/pt.js';
import { isDbConfigured, DbNotConfiguredError } from './db.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const middleware = cors({ origin: c.env.CORS_ORIGIN || '*', allowHeaders: ['Content-Type', 'Authorization'] });
  return middleware(c, next);
});

app.get('/', (c) => c.json({ name: 'lpt-worker', status: 'ok' }));
app.get('/health', (c) => c.json({ status: 'ok', dbConfigured: isDbConfigured(c.env) }));

app.route('/auth', authRoutes);
app.route('/users', usersRoutes);
app.route('/calendar', calendarRoutes);
app.route('/diets', dietsRoutes);
app.route('/payments', paymentsRoutes);
app.route('/endurance', enduranceRoutes);
app.route('/videos', videosRoutes);
app.route('/exercises', exercisesRoutes);
app.route('/workouts', workoutsRoutes);
app.route('/pt', ptRoutes);

app.notFound((c) => c.json({ message: 'Not found' }, 404));
app.onError((err, c) => {
  if (err instanceof DbNotConfiguredError) {
    return c.json({ message: err.message }, err.status);
  }
  console.error(err);
  return c.json({ message: 'Server error', detail: err.message }, 500);
});

export default app;
