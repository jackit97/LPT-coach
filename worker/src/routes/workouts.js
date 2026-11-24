import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { assertCoachOwnsAthlete } from '../utils.js';
import { notifyNewWorkout, notify } from '../lib/notify.js';
import { insertWorkoutsBulk } from '../lib/bulkWorkouts.js';
import { loadMergedZones } from '../lib/athleteData.js';
import { hrToZone } from '../lib/trainingLoad.js';
import { exercisesFromFileSets } from '../lib/strengthAnalysis.js';

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

const clock = (seconds) => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

async function structureFromActivity(sql, workout) {
  let row;
  try { row = (await sql`SELECT samples_json, laps_json FROM activity_streams WHERE workout_id = ${workout.workout_id}`)[0]; } catch { row = null; }
  if (!row) return {};
  let laps = [];
  let samples = {};
  try { laps = JSON.parse(row.laps_json || '[]') || []; } catch { laps = []; }
  try { samples = JSON.parse(row.samples_json || '{}') || {}; } catch { samples = {}; }

  if (workout.tipo !== 'endurance') {
    const groups = exercisesFromFileSets(samples.sets || []);
    return {
      esercizi: groups.map((group) => {
        const reps = group.sets.map((set) => set.reps).filter(Boolean);
        const kgs = group.sets.map((set) => set.kg).filter(Boolean);
        const secs = group.sets.map((set) => set.secondi).filter(Boolean);
        const common = reps.length ? reps.sort((a, b) => reps.filter((v) => v === b).length - reps.filter((v) => v === a).length)[0] : null;
        return {
          nome: group.nome, serie: group.sets.length,
          ripetizioni: common ? String(common) : secs.length && !reps.length ? `${Math.round(Math.max(...secs))}s` : null,
          carico: kgs.length ? `${Math.max(...kgs)} kg` : null, note: null, video_url: null, recupero: null,
        };
      }),
    };
  }

  const valid = laps.filter((lap) => Number(lap.secondi) > 0);
  if (!valid.length) return {};
  let hrZones = [];
  try { hrZones = (await loadMergedZones(sql, workout.utenteid)).heartRate || []; } catch { hrZones = []; }
  const steps = valid.slice(0, 60).map((lap, index) => {
    const meters = Math.round(Number(lap.metri) || 0);
    const type = valid.length > 2 && index === 0 ? 'Riscaldamento' : valid.length > 2 && index === valid.length - 1 ? 'Defaticamento' : 'Lavoro';
    return {
      type,
      ...(meters >= 50 ? { unit: 'mt', value: String(meters) } : { unit: 'mm:ss', value: clock(lap.secondi).replace(/^0:/, '') }),
      duration: clock(lap.secondi),
      zone: hrToZone(lap.fc_media, hrZones) || 'Z2',
      notes: lap.fc_media ? `FC media ${Math.round(lap.fc_media)} bpm` : '',
    };
  });
  const seconds = valid.reduce((sum, lap) => sum + Number(lap.secondi), 0);
  return {
    endurance: {
      zone: null, target: null, description: null, rpe_target: null, steps_text: null, steps_json: JSON.stringify(steps),
      duration_minutes: Math.round(seconds / 60), duration_seconds: Math.round(seconds), sport: workout.sport,
      elevation_m: workout.elev_gain_m || null, video_urls_json: null,
    },
  };
}

// Creates a calendar workout (plus exercises / endurance session) from a normalized snapshot.
async function insertWorkoutFromSnapshot(sql, coachId, utenteId, data, snap) {
  let sessionId = null;
  const sport = snap.endurance?.sport || snap.sport || null;
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
      INSERT INTO endurance_sessions (plan_id, "date", title, zone, duration_minutes, duration_seconds, target, description, rpe_target, steps_text, steps_json, sport, elevation_m, video_urls_json)
      VALUES (${plans[0].plan_id}, ${data}, ${snap.titolo}, ${e.zone || null}, ${e.duration_minutes || snap.durataMinuti || 0}, ${e.duration_seconds || null},
        ${e.target || null}, ${e.description || null}, ${e.rpe_target || null}, ${e.steps_text || null}, ${e.steps_json || null},
        ${sport}, ${e.elevation_m || null}, ${e.video_urls_json || null})
      RETURNING session_id
    `;
    sessionId = sessions[0].session_id;
  }
  const workouts = await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, rpe_pianificato, colore, sport, stato)
    VALUES (${utenteId}, ${coachId}, ${sessionId}, ${data}, ${snap.tipo || 'forza'}, ${snap.titolo}, ${snap.descrizione || null},
      ${snap.durataMinuti || null}, ${snap.durataSecondi || (snap.durataMinuti ? snap.durataMinuti * 60 : null)}, ${snap.rpe || snap.endurance?.rpe_target || null},
      ${snap.colore || null}, ${sport}, 'pianificato')
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
    durataSecondi: w.durata_secondi, rpe: w.rpe_pianificato, colore: w.colore, sport: w.sport,
    esercizi: snap.esercizi, endurance: snap.endurance,
  });
  await notifyNewWorkout(sql, created, user.userId);
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
  // attivita' svolta senza struttura del coach (Garmin/file/Strava): le fasi vengono ricostruite dai giri
  // (endurance) o dalle serie registrate dall'orologio (forza), cosi' in libreria non resta solo il titolo
  if (!snap.endurance && !snap.esercizi.length) {
    const rebuilt = await structureFromActivity(sql, w);
    if (rebuilt.endurance) snap.endurance = rebuilt.endurance;
    if (rebuilt.esercizi?.length) snap.esercizi = rebuilt.esercizi;
  }
  const enduranceJson = snap.endurance ? JSON.stringify({
    zone: snap.endurance.zone, target: snap.endurance.target, description: snap.endurance.description,
    rpe_target: snap.endurance.rpe_target, steps_text: snap.endurance.steps_text, steps_json: snap.endurance.steps_json,
    duration_minutes: snap.endurance.duration_minutes, duration_seconds: snap.endurance.duration_seconds,
    sport: snap.endurance.sport || w.sport, elevation_m: snap.endurance.elevation_m, video_urls_json: snap.endurance.video_urls_json,
  }) : null;
  const templates = await sql`
    INSERT INTO workouttemplates (ptuserid, nometemplate, notegenerali, tipo, durata_minuti, durata_secondi, endurance_json, rpe_pianificato)
    VALUES (${user.userId}, ${(nomeTemplate || w.titolo).trim()}, ${w.descrizione || null}, ${w.tipo || 'forza'},
      ${w.durata_minuti || null}, ${w.durata_secondi || null}, ${enduranceJson}, ${w.rpe_pianificato || null})
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

// POST /workouts/templates/from-sheet/:schedaid - salva in libreria un giorno di una scheda palestra
app.post('/templates/from-sheet/:schedaid', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const schedaId = Number(c.req.param('schedaid'));
  const sheets = await sql`SELECT * FROM schedeallenamento WHERE schedaid = ${schedaId}`;
  const sheet = sheets[0];
  if (!sheet || !await assertCoachOwnsAthlete(sql, user.userId, sheet.utenteid)) return c.json({ message: 'Scheda non trovata' }, 404);
  const exercises = await sql`SELECT * FROM esercizischeda WHERE schedaid = ${schedaId} ORDER BY esercizioid ASC`;
  const templates = await sql`
    INSERT INTO workouttemplates (ptuserid, nometemplate, notegenerali, tipo)
    VALUES (${user.userId}, ${String(sheet.nomescheda || 'Scheda palestra').trim()}, ${sheet.notegenerali || null}, 'forza')
    RETURNING templateid
  `;
  const templateId = templates[0].templateid;
  for (let i = 0; i < exercises.length; i += 1) {
    const ex = exercises[i];
    await sql`
      INSERT INTO workouttemplateexercises (templateid, nomeesercizio, serie, ripetizioni, descrizione, videourl, recupero, orderindex)
      VALUES (${templateId}, ${ex.nomeesercizio}, ${ex.serie || null}, ${ex.ripetizioni || null}, ${ex.descrizione || ex.noteutente || null},
        ${ex.videourl || null}, ${ex.recupero || null}, ${i})
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
  if (!templates.length) return c.json([]);
  const exercises = await sql`
    SELECT * FROM workouttemplateexercises WHERE templateid = ANY(${templates.map((t) => t.templateid)})
    ORDER BY orderindex ASC, templateexerciseid ASC
  `;
  return c.json(templates.map((template) => ({ ...template, esercizi: exercises.filter((e) => e.templateid === template.templateid) })));
});

// Campi di un allenamento della libreria (forza, funzionale o endurance), creato direttamente dalla libreria
function templateFields(body) {
  const tipo = ['forza', 'funzionale', 'endurance', 'mobilita', 'test'].includes(body.tipo) ? body.tipo : 'forza';
  const endurance = body.endurance && typeof body.endurance === 'object' ? body.endurance : null;
  // le colonne sono INT/SMALLINT: valori decimali o testo farebbero fallire l'INSERT
  const int = (value, max) => { const n = Math.round(Number(String(value ?? '').replace(',', '.'))); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null; };
  const minutes = int(body.durataMinuti, 100000);
  return {
    nome: String(body.nomeTemplate || '').trim().slice(0, 150),
    note: body.noteGenerali ?? null,
    tipo,
    durataMinuti: minutes,
    durataSecondi: int(body.durataSecondi, 10000000) || (minutes ? minutes * 60 : null),
    rpe: int(body.rpePianificato, 10),
    enduranceJson: tipo === 'endurance' && endurance ? JSON.stringify({
      ...endurance,
      steps_json: endurance.steps_json && typeof endurance.steps_json !== 'string' ? JSON.stringify(endurance.steps_json) : endurance.steps_json || null,
      video_urls_json: Array.isArray(endurance.video_urls) ? JSON.stringify(endurance.video_urls.slice(0, 10)) : endurance.video_urls_json || null,
    }) : null,
  };
}

async function saveTemplateExercises(sql, templateId, esercizi = []) {
  await sql`DELETE FROM workouttemplateexercises WHERE templateid = ${templateId}`;
  const text = (value, max) => (value === null || value === undefined || String(value).trim() === '' ? null : String(value).trim().slice(0, max));
  const rows = [];
  for (const exercise of esercizi) {
    const nome = String(exercise?.nome || exercise?.nomeesercizio || '').trim().slice(0, 100);
    if (!nome) continue;
    const serie = Math.round(Number(String(exercise.serie ?? '').replace(',', '.')));
    rows.push({
      nome, serie: Number.isFinite(serie) && serie > 0 ? Math.min(serie, 100) : null, ripetizioni: text(exercise.ripetizioni, 50),
      descrizione: exercise.descrizione ?? exercise.note ?? null, video: text(exercise.videoUrl || exercise.video_url, 255),
      recupero: text(exercise.recupero, 50), carico: text(exercise.carico, 50), pos: rows.length,
    });
  }
  if (!rows.length) return;
  // tutti gli esercizi in una query
  await sql`
    INSERT INTO workouttemplateexercises (templateid, nomeesercizio, serie, ripetizioni, descrizione, videourl, recupero, carico, orderindex)
    SELECT ${templateId}::int, nome, serie, ripetizioni, descrizione, video, recupero, carico, pos
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(nome text, serie int, ripetizioni text, descrizione text, video text, recupero text, carico text, pos int)
  `;
}

// GET /workouts/templates/:id
app.get('/templates/:id{[0-9]+}', async (c) => {
  const template = await getTemplate(db(c.env), Number(c.req.param('id')), c.get('user').userId);
  if (!template) return c.json({ message: 'Allenamento non trovato' }, 404);
  return c.json(template);
});

// POST /workouts/templates/:id/duplicate { nomeTemplate? } — copia di un allenamento (es. da modificare solo in un piano)
app.post('/templates/:id{[0-9]+}/duplicate', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const source = await getTemplate(sql, Number(c.req.param('id')), user.userId);
  if (!source) return c.json({ message: 'Allenamento non trovato' }, 404);
  const { nomeTemplate } = await c.req.json().catch(() => ({}));
  const rows = await sql`
    INSERT INTO workouttemplates (ptuserid, nometemplate, notegenerali, tipo, durata_minuti, durata_secondi, endurance_json, rpe_pianificato)
    VALUES (${user.userId}, ${String(nomeTemplate || `${source.nometemplate} (copia)`).trim().slice(0, 150)}, ${source.notegenerali}, ${source.tipo},
            ${source.durata_minuti}, ${source.durata_secondi}, ${source.endurance_json}, ${source.rpe_pianificato})
    RETURNING templateid
  `;
  await saveTemplateExercises(sql, rows[0].templateid, source.esercizi.map((e) => ({
    nome: e.nomeesercizio, serie: e.serie, ripetizioni: e.ripetizioni, carico: e.carico, recupero: e.recupero, descrizione: e.descrizione, videoUrl: e.videourl,
  })));
  return c.json(await getTemplate(sql, rows[0].templateid, user.userId), 201);
});

// POST /workouts/plans/:id/duplicate — copia di un piano della libreria (stessi allenamenti negli stessi giorni)
app.post('/plans/:id{[0-9]+}/duplicate', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const plan = await getPlan(sql, Number(c.req.param('id')), user.userId);
  if (!plan) return c.json({ message: 'Piano non trovato' }, 404);
  const rows = await sql`
    INSERT INTO library_plans (ptuserid, nome, descrizione, settimane)
    VALUES (${user.userId}, ${`${plan.nome} (copia)`.slice(0, 150)}, ${plan.descrizione || null}, ${plan.settimane})
    RETURNING plan_id
  `;
  await savePlanItems(sql, rows[0].plan_id, user.userId, plan.items.map((item) => ({ templateid: item.templateid, settimana: item.settimana, giorno: item.giorno })));
  return c.json(await getPlan(sql, rows[0].plan_id, user.userId), 201);
});

// POST /workouts/templates — nuovo allenamento standard creato dalla libreria
app.post('/templates', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const fields = templateFields(body);
  if (!fields.nome) return c.json({ message: 'Dai un nome all\'allenamento' }, 400);
  const sql = db(c.env);
  const rows = await sql`
    INSERT INTO workouttemplates (ptuserid, nometemplate, notegenerali, tipo, durata_minuti, durata_secondi, endurance_json, rpe_pianificato)
    VALUES (${user.userId}, ${fields.nome}, ${fields.note}, ${fields.tipo}, ${fields.durataMinuti}, ${fields.durataSecondi}, ${fields.enduranceJson}, ${fields.rpe})
    RETURNING templateid
  `;
  await saveTemplateExercises(sql, rows[0].templateid, body.esercizi || []);
  return c.json(await getTemplate(sql, rows[0].templateid, user.userId), 201);
});

// PUT /workouts/templates/:id — modifica completa (stessi campi della creazione)
app.put('/templates/:id{[0-9]+}', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const sql = db(c.env);
  const existing = await getTemplate(sql, id, user.userId);
  if (!existing) return c.json({ message: 'Allenamento non trovato' }, 404);
  const fields = templateFields({ ...body, tipo: body.tipo || existing.tipo });
  await sql`
    UPDATE workouttemplates SET
      nometemplate = ${fields.nome || existing.nometemplate},
      notegenerali = ${body.noteGenerali !== undefined ? fields.note : existing.notegenerali},
      tipo = ${fields.tipo},
      durata_minuti = ${body.durataMinuti !== undefined ? fields.durataMinuti : existing.durata_minuti},
      durata_secondi = ${body.durataMinuti !== undefined || body.durataSecondi !== undefined ? fields.durataSecondi : existing.durata_secondi},
      rpe_pianificato = ${body.rpePianificato !== undefined ? fields.rpe : existing.rpe_pianificato},
      endurance_json = ${body.endurance !== undefined ? fields.enduranceJson : existing.endurance_json},
      updatedat = NOW()
    WHERE templateid = ${id}
  `;
  if (Array.isArray(body.esercizi)) await saveTemplateExercises(sql, id, body.esercizi);
  return c.json(await getTemplate(sql, id, user.userId));
});

function templateSnapshot(template, titolo) {
  let endurance = null;
  if (template.endurance_json) {
    try { endurance = JSON.parse(template.endurance_json); } catch { endurance = null; }
  }
  return {
    tipo: template.tipo || 'forza',
    titolo: titolo || template.nometemplate,
    descrizione: template.notegenerali,
    durataMinuti: template.durata_minuti,
    durataSecondi: template.durata_secondi,
    rpe: template.rpe_pianificato,
    esercizi: template.esercizi.map((e) => ({
      nome: e.nomeesercizio, serie: e.serie, ripetizioni: e.ripetizioni, carico: e.carico,
      recupero: e.recupero, note: e.descrizione, video_url: e.videourl,
    })),
    endurance,
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Piu' allenamenti della libreria in 2 query (Cloudflare limita le query per richiesta)
async function getTemplates(sql, ids, coachId) {
  const unique = [...new Set(ids.map(Number).filter(Boolean))];
  if (!unique.length) return new Map();
  const templates = await sql`SELECT * FROM workouttemplates WHERE templateid = ANY(${unique}) AND ptuserid = ${coachId}`;
  const exercises = templates.length ? await sql`
    SELECT * FROM workouttemplateexercises WHERE templateid = ANY(${templates.map((t) => t.templateid)})
    ORDER BY orderindex ASC, templateexerciseid ASC
  ` : [];
  return new Map(templates.map((t) => [t.templateid, { ...t, esercizi: exercises.filter((e) => e.templateid === t.templateid) }]));
}

// tutti gli atleti sono del coach? (una query sola)
async function coachOwnsAll(sql, coachId, athleteIds) {
  const rows = await sql`
    SELECT DISTINCT cliente_userid FROM pt_clienti WHERE pt_userid = ${coachId} AND attivo = 1 AND cliente_userid = ANY(${athleteIds})
  `;
  return rows.length === new Set(athleteIds).size;
}

// snapshot (come templateSnapshot) -> elemento per insertWorkoutsBulk
const bulkItem = (coachId, athleteId, data, snap) => ({
  utenteId: athleteId, coachId, data, tipo: snap.tipo, titolo: snap.titolo, descrizione: snap.descrizione,
  durataMinuti: snap.durataMinuti, durataSecondi: snap.durataSecondi, rpe: snap.rpe, colore: snap.colore, sport: snap.sport,
  esercizi: snap.esercizi, endurance: snap.endurance,
});
const MAX_BULK = 200;

// Notifica unica per atleta quando riceve piu' allenamenti insieme
async function notifyBulk(sql, coachId, athleteId, workouts, label) {
  if (!workouts.length) return;
  if (workouts.length === 1) { await notifyNewWorkout(sql, workouts[0], coachId); return; }
  const days = workouts.map((w) => String(w.data instanceof Date ? w.data.toISOString() : w.data).slice(0, 10)).sort();
  const fmt = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
  await notify(sql, athleteId, {
    tipo: 'workout',
    mittenteId: coachId,
    titolo: `${workouts.length} nuovi allenamenti: ${label}`,
    messaggio: `Dal ${fmt(days[0])} al ${fmt(days[days.length - 1])}`,
    link: { screen: 'WorkoutDetail', params: { workoutId: workouts[0].workout_id } },
  });
}

// POST /workouts/templates/:id/assign-bulk { utenteIds: [..], dates: ['YYYY-MM-DD', ..] }
app.post('/templates/:id{[0-9]+}/assign-bulk', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const { utenteIds = [], dates = [], titolo } = await c.req.json().catch(() => ({}));
  const athletes = [...new Set(utenteIds.map(Number).filter(Boolean))];
  const days = [...new Set(dates.filter((d) => ISO_DAY.test(String(d))))].sort();
  if (!athletes.length || !days.length) return c.json({ message: 'Scegli almeno un atleta e una data' }, 400);
  if (athletes.length * days.length > MAX_BULK) return c.json({ message: `Troppi allenamenti in un colpo (massimo ${MAX_BULK})` }, 400);
  const sql = db(c.env);
  if (!await coachOwnsAll(sql, user.userId, athletes)) return c.json({ message: 'Uno degli atleti non è tra i tuoi' }, 403);
  const template = await getTemplate(sql, id, user.userId);
  if (!template) return c.json({ message: 'Allenamento non trovato' }, 404);
  const snap = templateSnapshot(template, titolo);
  const inserted = await insertWorkoutsBulk(sql, athletes.flatMap((athleteId) => days.map((day) => bulkItem(user.userId, athleteId, day, snap))));
  const created = inserted.length;
  for (const athleteId of athletes) {
    await notifyBulk(sql, user.userId, athleteId, inserted.filter((w) => Number(w.utenteid) === athleteId), template.nometemplate);
  }
  return c.json({ created, message: `${created} allenament${created === 1 ? 'o assegnato' : 'i assegnati'}` }, 201);
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
  const workout = await insertWorkoutFromSnapshot(sql, user.userId, Number(utenteId), data, templateSnapshot(template, titolo));
  await notifyNewWorkout(sql, workout, user.userId);
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

// ---------- Piani della libreria: piu' settimane di allenamenti della libreria ----------
async function getPlan(sql, planId, coachId) {
  const plans = await sql`SELECT * FROM library_plans WHERE plan_id = ${planId} AND ptuserid = ${coachId}`;
  if (!plans[0]) return null;
  const items = await sql`
    SELECT i.item_id, i.templateid, i.settimana, i.giorno, t.nometemplate, t.tipo, t.durata_minuti, t.durata_secondi,
           (t.endurance_json::jsonb ->> 'sport') AS sport
    FROM library_plan_items i JOIN workouttemplates t ON t.templateid = i.templateid
    WHERE i.plan_id = ${planId}
    ORDER BY i.settimana ASC, i.giorno ASC, i.item_id ASC
  `;
  return { ...plans[0], items };
}

function cleanItems(items, weeks) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({ templateid: Number(item.templateid), settimana: Number(item.settimana), giorno: Number(item.giorno) }))
    .filter((item) => item.templateid && item.settimana >= 1 && item.settimana <= weeks && item.giorno >= 1 && item.giorno <= 7);
}

async function savePlanItems(sql, planId, coachId, items) {
  await sql`DELETE FROM library_plan_items WHERE plan_id = ${planId}`;
  if (!items.length) return;
  // una query sola: inserisce solo gli allenamenti che sono davvero del coach
  await sql`
    INSERT INTO library_plan_items (plan_id, templateid, settimana, giorno)
    SELECT ${planId}::int, x.templateid, x.settimana, x.giorno
    FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(templateid int, settimana int, giorno int)
    JOIN workouttemplates t ON t.templateid = x.templateid AND t.ptuserid = ${coachId}::int
  `;
}

app.get('/plans/mine', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  let plans;
  try {
    plans = await sql`SELECT plan_id FROM library_plans WHERE ptuserid = ${user.userId} ORDER BY COALESCE(updated_at, created_at) DESC`;
  } catch (error) {
    if (/library_plans/.test(String(error?.message))) return c.json([]); // migrazione non ancora applicata
    throw error;
  }
  if (!plans.length) return c.json([]);
  // tutti i piani con i loro elementi in 2 query (non una per piano: Cloudflare limita le query per richiesta)
  const full = await sql`SELECT * FROM library_plans WHERE plan_id = ANY(${plans.map((plan) => plan.plan_id)})`;
  const items = await sql`
    SELECT i.plan_id, i.item_id, i.templateid, i.settimana, i.giorno, t.nometemplate, t.tipo, t.durata_minuti, t.durata_secondi,
           (t.endurance_json::jsonb ->> 'sport') AS sport
    FROM library_plan_items i JOIN workouttemplates t ON t.templateid = i.templateid
    WHERE i.plan_id = ANY(${plans.map((plan) => plan.plan_id)})
    ORDER BY i.settimana ASC, i.giorno ASC, i.item_id ASC
  `;
  const byId = new Map(full.map((plan) => [plan.plan_id, plan]));
  return c.json(plans.map((plan) => ({ ...byId.get(plan.plan_id), items: items.filter((item) => item.plan_id === plan.plan_id) })));
});

app.get('/plans/:id{[0-9]+}', async (c) => {
  const plan = await getPlan(db(c.env), Number(c.req.param('id')), c.get('user').userId);
  if (!plan) return c.json({ message: 'Piano non trovato' }, 404);
  return c.json(plan);
});

app.post('/plans', async (c) => {
  const user = c.get('user');
  const { nome, descrizione, settimane, items } = await c.req.json().catch(() => ({}));
  if (!String(nome || '').trim()) return c.json({ message: 'Dai un nome al piano' }, 400);
  const weeks = Math.min(52, Math.max(1, Number(settimane) || 4));
  const sql = db(c.env);
  const rows = await sql`
    INSERT INTO library_plans (ptuserid, nome, descrizione, settimane) VALUES (${user.userId}, ${String(nome).trim()}, ${descrizione || null}, ${weeks})
    RETURNING plan_id
  `;
  await savePlanItems(sql, rows[0].plan_id, user.userId, cleanItems(items, weeks));
  return c.json(await getPlan(sql, rows[0].plan_id, user.userId), 201);
});

app.put('/plans/:id{[0-9]+}', async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const sql = db(c.env);
  const existing = await getPlan(sql, id, user.userId);
  if (!existing) return c.json({ message: 'Piano non trovato' }, 404);
  const { nome, descrizione, settimane, items } = await c.req.json().catch(() => ({}));
  const weeks = Math.min(52, Math.max(1, Number(settimane) || existing.settimane));
  await sql`
    UPDATE library_plans SET nome = ${String(nome || existing.nome).trim()}, descrizione = ${descrizione !== undefined ? descrizione || null : existing.descrizione},
      settimane = ${weeks}, updated_at = NOW()
    WHERE plan_id = ${id}
  `;
  if (Array.isArray(items)) await savePlanItems(sql, id, user.userId, cleanItems(items, weeks));
  return c.json(await getPlan(sql, id, user.userId));
});

app.delete('/plans/:id{[0-9]+}', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const deleted = await sql`DELETE FROM library_plans WHERE plan_id = ${Number(c.req.param('id'))} AND ptuserid = ${user.userId} RETURNING plan_id`;
  if (!deleted[0]) return c.json({ message: 'Piano non trovato' }, 404);
  return c.json({ message: 'Eliminato' });
});

// POST /workouts/plans/:id/assign { utenteIds, startDate } — la settimana 1 parte dal lunedi' della data scelta
app.post('/plans/:id{[0-9]+}/assign', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const plan = await getPlan(sql, Number(c.req.param('id')), user.userId);
  if (!plan) return c.json({ message: 'Piano non trovato' }, 404);
  if (!plan.items.length) return c.json({ message: 'Il piano non contiene allenamenti' }, 400);
  const { utenteIds = [], startDate } = await c.req.json().catch(() => ({}));
  const athletes = [...new Set(utenteIds.map(Number).filter(Boolean))];
  if (!athletes.length || !ISO_DAY.test(String(startDate || ''))) return c.json({ message: 'Scegli almeno un atleta e la data di inizio' }, 400);
  if (athletes.length * plan.items.length > MAX_BULK) return c.json({ message: `Troppi allenamenti in un colpo (massimo ${MAX_BULK})` }, 400);
  if (!await coachOwnsAll(sql, user.userId, athletes)) return c.json({ message: 'Uno degli atleti non è tra i tuoi' }, 403);
  const start = new Date(`${startDate}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // lunedi' della settimana
  const dayOf = (item) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + (item.settimana - 1) * 7 + (item.giorno - 1));
    return date.toISOString().slice(0, 10);
  };
  const templates = await getTemplates(sql, plan.items.map((item) => item.templateid), user.userId);
  const lastDay = new Date(start);
  lastDay.setUTCDate(start.getUTCDate() + plan.settimane * 7 - 1);
  // tutti gli allenamenti di tutti gli atleti in poche query
  const items = [];
  for (const athleteId of athletes) {
    for (const item of plan.items) {
      const template = templates.get(item.templateid);
      if (template) items.push(bulkItem(user.userId, athleteId, dayOf(item), templateSnapshot(template)));
    }
  }
  const inserted = await insertWorkoutsBulk(sql, items);
  const created = inserted.length;
  // il piano resta visibile all'atleta (Pesistica / Endurance) come programma, non solo come allenamenti sparsi
  try {
    const assignments = await sql`
      INSERT INTO plan_assignments (plan_id, coach_id, utenteid, nome, descrizione, settimane, data_inizio, data_fine)
      SELECT ${plan.plan_id}::int, ${user.userId}::int, athlete, ${plan.nome}::text, ${plan.descrizione || null}::text, ${plan.settimane}::int,
             ${start.toISOString().slice(0, 10)}::date, ${lastDay.toISOString().slice(0, 10)}::date
      FROM unnest(${athletes}::int[]) AS athlete
      RETURNING assignment_id, utenteid
    `;
    const assignmentOf = new Map(assignments.map((row) => [Number(row.utenteid), row.assignment_id]));
    const links = inserted.map((w) => ({ wid: w.workout_id, aid: assignmentOf.get(Number(w.utenteid)) })).filter((link) => link.aid);
    if (links.length) {
      await sql`
        UPDATE calendar_workouts SET plan_assignment_id = m.aid
        FROM jsonb_to_recordset(${JSON.stringify(links)}::jsonb) AS m(wid int, aid int)
        WHERE calendar_workouts.workout_id = m.wid
      `;
    }
  } catch (error) {
    if (!/plan_assignment/.test(String(error?.message))) throw error; // migrazione 20261125 non ancora applicata
  }
  for (const athleteId of athletes) {
    await notifyBulk(sql, user.userId, athleteId, inserted.filter((w) => Number(w.utenteid) === athleteId), plan.nome);
  }
  return c.json({ created, startMonday: start.toISOString().slice(0, 10), message: `Piano assegnato: ${created} allenamenti` }, 201);
});

export default app;
