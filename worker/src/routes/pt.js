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
    SELECT u.utenteid AS id, u.nome, u.cognome, u.email,
      (SELECT COUNT(*)::int FROM calendar_workouts w WHERE w.utenteid = u.utenteid AND w.data >= CURRENT_DATE AND w.data < CURRENT_DATE + INTERVAL '7 days') AS workout_settimana,
      (SELECT COUNT(*)::int FROM calendar_workouts w WHERE w.utenteid = u.utenteid AND w.stato = 'completato' AND w.data >= CURRENT_DATE - INTERVAL '7 days') AS completati_settimana,
      (SELECT COUNT(*)::int FROM diete d WHERE d.utenteid = u.utenteid AND d.attiva = 1) AS diete_attive
    FROM pt_clienti pc
    JOIN utenti u ON u.utenteid = pc.cliente_userid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1
    ORDER BY u.nome ASC
  `;
  const expiringWorkouts = await sql`
    SELECT s.schedaid, s.utenteid, TRIM(CONCAT_WS(' ', u.nome, u.cognome)) AS nomeutente, s.nomescheda, s.datafine
    FROM schedeallenamento s JOIN utenti u ON u.utenteid = s.utenteid
    JOIN pt_clienti pc ON pc.cliente_userid = s.utenteid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1 AND s.attiva = 1
      AND s.datafine BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    ORDER BY s.datafine ASC
  `;
  const expiringDiets = await sql`
    SELECT d.dietaid, d.utenteid, TRIM(CONCAT_WS(' ', u.nome, u.cognome)) AS nomeutente, d.nome, d.datafine
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

const shortDay = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
const sheetName = (name) => String(name || 'Scheda').replace(/\s+-\s+Giorno\s+[A-Za-z0-9]+$/i, '').trim();
// una query che fallisce (es. migrazione non ancora applicata) non deve bloccare il Coach Assistant
const safeQuery = async (run) => { try { return await run(); } catch (error) { console.error('Coach Assistant:', error.message); return []; } };

// Dati di tutti gli atleti del coach in poche query (limite di 50 query per richiesta su Cloudflare)
async function loadAssistantContext(sql, ids, today, weekAgo, soon) {
  const [sheets, diets, checks, assessments, workoutNotes, sheetNotes, reports, flags] = await Promise.all([
    safeQuery(() => sql`SELECT utenteid, nomescheda, datafine FROM schedeallenamento WHERE utenteid = ANY(${ids}) AND datafine >= ${today}`),
    safeQuery(() => sql`SELECT utenteid, nome, datafine FROM diete WHERE utenteid = ANY(${ids}) AND attiva = 1 AND (datafine IS NULL OR datafine >= ${today})`),
    safeQuery(() => sql`SELECT athlete_id AS utenteid, scadenza FROM body_checks WHERE athlete_id = ANY(${ids}) AND stato = 'richiesto' AND scadenza IS NOT NULL AND scadenza <= ${soon}`),
    safeQuery(() => sql`SELECT DISTINCT ON (utenteid) utenteid, prossima_data FROM body_assessments WHERE utenteid = ANY(${ids}) ORDER BY utenteid, data DESC, assessment_id DESC`),
    safeQuery(() => sql`
      SELECT w.utenteid, COUNT(*)::int AS n FROM calendar_workout_exercises x JOIN calendar_workouts w ON w.workout_id = x.workout_id
      WHERE w.utenteid = ANY(${ids}) AND x.note_atleta_at >= ${weekAgo} AND COALESCE(TRIM(x.note_atleta), '') <> '' GROUP BY w.utenteid`),
    safeQuery(() => sql`
      SELECT s.utenteid, COUNT(*)::int AS n FROM esercizischeda e JOIN schedeallenamento s ON s.schedaid = e.schedaid
      WHERE s.utenteid = ANY(${ids}) AND e.note_atleta_at >= ${weekAgo} AND COALESCE(TRIM(e.note_atleta), '') <> '' GROUP BY s.utenteid`),
    safeQuery(() => sql`
      SELECT r.athlete_id AS utenteid, COUNT(*)::int AS n FROM workout_reports r
      WHERE r.athlete_id = ANY(${ids}) AND (r.inviato_at >= ${weekAgo} OR EXISTS (
        SELECT 1 FROM workout_report_messages m WHERE m.report_id = r.report_id AND m.da_coach = FALSE AND m.created_at >= ${weekAgo}))
      GROUP BY r.athlete_id`),
    safeQuery(() => sql`SELECT utenteid, forza_visibile, dieta_visibile, progressi_visibile FROM utenti WHERE utenteid = ANY(${ids})`),
  ]);
  const byUser = (rows) => rows.reduce((map, row) => map.set(row.utenteid, [...(map.get(row.utenteid) || []), row]), new Map());
  const counts = (rows) => new Map(rows.map((row) => [row.utenteid, row.n]));
  return {
    soon,
    sheets: byUser(sheets), diets: byUser(diets), checks: byUser(checks),
    assessments: new Map(assessments.map((row) => [row.utenteid, row])),
    workoutNotes: counts(workoutNotes), sheetNotes: counts(sheetNotes), reports: counts(reports),
    flags: new Map(flags.map((row) => [row.utenteid, row])),
  };
}

// Mostra l'atleta solo se: ha svolto allenamenti negli ultimi 7 giorni, ha scritto note/commenti/report per il coach,
// ha una scheda o una dieta che scade entro 7 giorni (senza una nuova gia' pronta) o un check / una valutazione da fare entro 7 giorni.
function assistantReasons(ctx, userId, { doneWeek, feedbackNotes, today }) {
  if (!ctx) return [];
  const reasons = [];
  const flags = ctx.flags.get(userId) || {};
  if (doneWeek > 0) reasons.push({ type: 'allenamenti', message: `${doneWeek} ${doneWeek === 1 ? 'allenamento svolto' : 'allenamenti svolti'} negli ultimi 7 giorni` });
  const notes = feedbackNotes + (ctx.workoutNotes.get(userId) || 0) + (ctx.sheetNotes.get(userId) || 0);
  if (notes > 0) reasons.push({ type: 'note', message: `${notes} ${notes === 1 ? 'nota/commento' : 'note/commenti'} per te negli ultimi 7 giorni` });
  const reports = ctx.reports.get(userId) || 0;
  if (reports > 0) reasons.push({ type: 'report', message: `${reports} ${reports === 1 ? 'report/messaggio' : 'report/messaggi'} negli ultimi 7 giorni` });

  if (flags.forza_visibile !== false) {
    const sheets = ctx.sheets.get(userId) || [];
    const later = sheets.some((row) => isoDay(row.datafine) > ctx.soon);
    const expiring = sheets.filter((row) => isoDay(row.datafine) <= ctx.soon).sort((a, b) => String(isoDay(a.datafine)).localeCompare(isoDay(b.datafine)));
    if (expiring.length && !later) reasons.push({ type: 'scheda', urgent: true, message: `Scheda «${sheetName(expiring[0].nomescheda)}» scade il ${shortDay(isoDay(expiring[0].datafine))}` });
  }
  if (flags.dieta_visibile !== false) {
    const diets = ctx.diets.get(userId) || [];
    const later = diets.some((row) => !row.datafine || isoDay(row.datafine) > ctx.soon);
    const expiring = diets.filter((row) => row.datafine && isoDay(row.datafine) <= ctx.soon).sort((a, b) => String(isoDay(a.datafine)).localeCompare(isoDay(b.datafine)));
    if (expiring.length && !later) reasons.push({ type: 'dieta', urgent: true, message: `Dieta «${expiring[0].nome || 'dieta'}» scade il ${shortDay(isoDay(expiring[0].datafine))}` });
  }
  if (flags.progressi_visibile !== false) {
    const checks = (ctx.checks.get(userId) || []).sort((a, b) => String(isoDay(a.scadenza)).localeCompare(isoDay(b.scadenza)));
    if (checks.length) {
      const due = isoDay(checks[0].scadenza);
      reasons.push({ type: 'check', urgent: true, message: due < today ? `Check fotografico scaduto il ${shortDay(due)}` : `Check fotografico entro il ${shortDay(due)}` });
    }
  }
  const assessment = ctx.assessments.get(userId);
  if (flags.progressi_visibile !== false && assessment?.prossima_data && isoDay(assessment.prossima_data) <= ctx.soon) {
    const due = isoDay(assessment.prossima_data);
    reasons.push({ type: 'valutazione', urgent: true, message: due < today ? `Valutazione corporea da fare (era il ${shortDay(due)})` : `Valutazione corporea il ${shortDay(due)}` });
  }
  return reasons;
}

// GET /pt/alerts - Coach Assistant: stato di ogni atleta e alert su inattivita', aderenza al programma,
// variazione del carico (acuto/cronico) e commenti agli allenamenti.
app.get('/alerts', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const today = todayIso();
  const weekAgo = addDaysIso(today, -6);
  const athletes = await sql`
    SELECT u.utenteid, u.nome, COALESCE(NULLIF(TRIM(u.cognome), ''), p.cognome) AS cognome
    FROM pt_clienti pc
    JOIN utenti u ON u.utenteid = pc.cliente_userid
    LEFT JOIN profiloutente p ON p.utenteid = u.utenteid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1
    ORDER BY u.nome ASC
  `;

  const ids = athletes.map((athlete) => athlete.utenteid);
  const soon = addDaysIso(today, 7);
  const ctx = ids.length ? await loadAssistantContext(sql, ids, today, weekAgo, soon) : null;

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

    // Motivi per cui l'atleta compare nel Coach Assistant (altrimenti resta solo nell'elenco atleti)
    const doneWeek = training.filter((workout) => isoDay(workout.data) >= weekAgo && isoDay(workout.data) <= today
      && (workout.load.secondi_eseguiti > 0 || workout.stato === 'completato')).length;
    const feedbackNotes = training.filter((workout) => isoDay(workout.data) >= weekAgo && !workout.external_provider && String(workout.feedback_note || '').trim()).length;
    const reasons = assistantReasons(ctx, athlete.utenteid, { doneWeek, feedbackNotes, today });

    results.push({
      utenteid: athlete.utenteid,
      in_evidenza: reasons.length > 0,
      motivi: reasons,
      allenamenti_7gg: doneWeek,
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
  const urgent = (athlete) => athlete.motivi.some((reason) => reason.urgent);
  results.sort((a, b) => {
    const pa = Math.min(3, ...a.alerts.map((alert) => order[alert.priority]));
    const pb = Math.min(3, ...b.alerts.map((alert) => order[alert.priority]));
    return Number(b.in_evidenza) - Number(a.in_evidenza) || Number(urgent(b)) - Number(urgent(a)) || pa - pb || a.nome.localeCompare(b.nome);
  });
  return c.json({ rules: ALERT_RULES, today, athletes: results });
});

export default app;
