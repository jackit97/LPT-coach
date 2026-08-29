import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';

const app = new Hono();
app.use('*', authenticate());
app.use('*', roleCheck('personal_trainer'));

app.get('/stats', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const activeClients = await sql`
    SELECT u.utenteid AS id, u.nome, u.email,
      (SELECT COUNT(*)::int FROM calendar_workouts w WHERE w.utenteid = u.utenteid AND w.data >= CURRENT_DATE AND w.data < CURRENT_DATE + INTERVAL '7 days') AS workout_settimana,
      (SELECT COUNT(*)::int FROM calendar_workouts w WHERE w.utenteid = u.utenteid AND w.stato = 'completato' AND w.data >= CURRENT_DATE - INTERVAL '7 days') AS completati_settimana,
      (SELECT COUNT(*)::int FROM diete d WHERE d.utenteid = u.utenteid AND d.attiva = 1) AS diete_attive
    FROM pt_clienti pc
    JOIN utenti u ON u.utenteid = pc.cliente_userid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1
    ORDER BY u.nome ASC
  `;
  const expiringWorkouts = await sql`
    SELECT s.schedaid, s.utenteid, u.nome AS nomeutente, s.nomescheda, s.datafine
    FROM schedeallenamento s JOIN utenti u ON u.utenteid = s.utenteid
    JOIN pt_clienti pc ON pc.cliente_userid = s.utenteid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1 AND s.attiva = 1
      AND s.datafine BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    ORDER BY s.datafine ASC
  `;
  const expiringDiets = await sql`
    SELECT d.dietaid, d.utenteid, u.nome AS nomeutente, d.nome, d.datafine
    FROM diete d JOIN utenti u ON u.utenteid = d.utenteid
    JOIN pt_clienti pc ON pc.cliente_userid = d.utenteid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1 AND d.attiva = 1
      AND d.datafine BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    ORDER BY d.datafine ASC
  `;
  return c.json({
    activeClientsCount: activeClients.length,
    expiringWorkoutsCount: expiringWorkouts.length,
    expiringDietsCount: expiringDiets.length,
    activeClients,
    expiringWorkouts,
    expiringDiets,
  });
});

export default app;
