import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { loadWorkoutsWithLoad } from '../lib/athleteData.js';
import { buildLoadSeries, todayIso, addDaysIso, isoDay, CHRONIC_DAYS } from '../lib/trainingLoad.js';

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

// Soglie del Coach Assistant (in CoachPeaking sono configurabili; qui i default proposti da loro).
const ALERT_RULES = {
  inactivityDays: 4,
  adherenceMinPct: 70,
  loadRatioMin: 0.5,
  loadRatioMax: 1.5,
  commentDays: 7,
};

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T12:00:00Z`) - new Date(`${fromIso}T12:00:00Z`)) / 86400000);
}

// GET /pt/alerts - Coach Assistant: stato di ogni atleta e alert su inattivita', aderenza al programma,
// variazione del carico (acuto/cronico) e commenti agli allenamenti.
app.get('/alerts', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const today = todayIso();
  const weekAgo = addDaysIso(today, -6);
  const athletes = await sql`
    SELECT u.utenteid, u.nome, p.cognome
    FROM pt_clienti pc
    JOIN utenti u ON u.utenteid = pc.cliente_userid
    LEFT JOIN profiloutente p ON p.utenteid = u.utenteid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1
    ORDER BY u.nome ASC
  `;

  const results = [];
  for (const athlete of athletes) {
    const workouts = await loadWorkoutsWithLoad(sql, athlete.utenteid, addDaysIso(today, -CHRONIC_DAYS * 3), today);
    const series = buildLoadSeries(workouts, { from: weekAgo, to: today, today });
    const current = series[series.length - 1] || { acuto: 0, cronico: 0, performance: 0 };
    const training = workouts.filter((workout) => workout.load);
    const lastDone = [...training].reverse().find((workout) => workout.load.secondi_eseguiti > 0);
    const lastComment = [...training].reverse().find((workout) => !workout.external_provider && String(workout.feedback_note || '').trim());
    const week = training.filter((workout) => isoDay(workout.data) >= weekAgo);
    const plannedSeconds = week.reduce((sum, workout) => sum + workout.load.secondi_pianificati, 0);
    const doneSeconds = week.reduce((sum, workout) => sum + workout.load.secondi_eseguiti, 0);
    const adherence = plannedSeconds > 0 ? Math.round((doneSeconds / plannedSeconds) * 100) : null;
    const loadRatio = current.cronico > 1 ? Number((current.acuto / current.cronico).toFixed(2)) : null;
    const inactiveDays = lastDone ? daysBetween(isoDay(lastDone.data), today) : null;
    const commentDays = lastComment ? daysBetween(isoDay(lastComment.data), today) : null;

    const alerts = [];
    if (inactiveDays === null ? training.length > 0 : inactiveDays >= ALERT_RULES.inactivityDays) {
      alerts.push({ type: 'inattivita', priority: inactiveDays === null || inactiveDays >= ALERT_RULES.inactivityDays * 2 ? 'alta' : 'media', message: inactiveDays === null ? 'Nessun allenamento eseguito' : `Nessun allenamento da ${inactiveDays} giorni` });
    }
    if (adherence !== null && adherence < ALERT_RULES.adherenceMinPct) {
      alerts.push({ type: 'aderenza', priority: adherence < ALERT_RULES.adherenceMinPct / 2 ? 'alta' : 'media', message: `Aderenza al programma ${adherence}% negli ultimi 7 giorni` });
    }
    if (loadRatio !== null && (loadRatio < ALERT_RULES.loadRatioMin || loadRatio > ALERT_RULES.loadRatioMax)) {
      alerts.push({ type: 'carico', priority: loadRatio > ALERT_RULES.loadRatioMax ? 'alta' : 'media', message: loadRatio > ALERT_RULES.loadRatioMax ? `Picco di carico: acuto/cronico ${loadRatio}` : `Carico in calo: acuto/cronico ${loadRatio}` });
    }
    if (training.some((workout) => !workout.external_provider) && (commentDays === null || commentDays >= ALERT_RULES.commentDays)) {
      alerts.push({ type: 'commenti', priority: 'bassa', message: commentDays === null ? 'Nessun commento agli allenamenti' : `Nessun commento da ${commentDays} giorni` });
    }

    results.push({
      utenteid: athlete.utenteid,
      nome: [athlete.nome, athlete.cognome].filter(Boolean).join(' '),
      acuto: current.acuto,
      cronico: current.cronico,
      performance: current.performance,
      rapporto_carico: loadRatio,
      aderenza_pct: adherence,
      giorni_inattivita: inactiveDays,
      giorni_senza_commenti: commentDays,
      alerts,
    });
  }

  const order = { alta: 0, media: 1, bassa: 2 };
  results.sort((a, b) => {
    const pa = Math.min(3, ...a.alerts.map((alert) => order[alert.priority]));
    const pb = Math.min(3, ...b.alerts.map((alert) => order[alert.priority]));
    return pa - pb || a.nome.localeCompare(b.nome);
  });
  return c.json({ rules: ALERT_RULES, today, athletes: results });
});

export default app;
