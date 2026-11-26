import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { assertAccessToAthlete } from '../utils.js';
import { notify, coachOf, userName, fmtDay } from '../lib/notify.js';
import { safeSets, exercisesFromFileSets } from '../lib/strengthAnalysis.js';

// Allenamenti di forza: l'atleta carica il video di esecuzione e scrive i dubbi per ogni esercizio.
// Quando segna l'allenamento come completato puo' inviare al coach un report (feedback, note, dubbi, video)
// che il coach trova nella sezione "Report atleti" e commenta.
// I video stanno nel bucket R2 collegato al Worker (binding CHECK_PHOTOS, prefisso esecuzioni/).

const app = new Hono();
// I video vengono aperti da <video src> senza header: sono protetti da un token firmato nell'URL
app.use('*', async (c, next) => (/\/execution\/\d+\/file$/.test(c.req.path) ? next() : authenticate()(c, next)));

const MAX_VIDEO_BYTES = 90 * 1024 * 1024;
const VIDEO_TTL = 60 * 60 * 6;
const VIDEO_MIME = /^video\/(mp4|quicktime|webm|3gpp|3gpp2|x-m4v|mpeg|x-matroska)$/i;
const secret = (env) => env.JWT_SECRET || 'dev-secret';

async function videoUrl(c, esecuzioneId, updatedAt) {
  const token = await sign({ eid: esecuzioneId, purpose: 'exec-video', exp: Math.floor(Date.now() / 1000) + VIDEO_TTL }, secret(c.env));
  const origin = new URL(c.req.url).origin;
  const version = updatedAt ? new Date(updatedAt).getTime() : 0;
  return `${origin}/reports/execution/${esecuzioneId}/file?t=${encodeURIComponent(token)}&v=${version}`;
}

// Video e dubbi di ogni esercizio di un allenamento: { [exercise_id]: { dubbi, video_url, ... } }
export async function executionsFor(c, sql, workoutId) {
  let rows = [];
  try {
    rows = await sql`SELECT * FROM esecuzioni_video WHERE workout_id = ${workoutId}`;
  } catch (error) {
    // migrazione 20261119 non ancora applicata: l'allenamento si apre comunque
    if (/esecuzioni_video/.test(String(error?.message))) return {};
    throw error;
  }
  const out = {};
  for (const row of rows) {
    out[row.exercise_id] = {
      esecuzione_id: row.esecuzione_id,
      dubbi: row.dubbi,
      video_url: row.storage_key ? await videoUrl(c, row.esecuzione_id, row.updated_at) : null,
      video_mime: row.mime,
      video_size: row.size_bytes,
      updated_at: row.updated_at,
    };
  }
  return out;
}

export async function reportFor(sql, workoutId) {
  try {
    const rows = await sql`
      SELECT report_id, inviato_at, letto_at, risposta, risposta_at FROM workout_reports WHERE workout_id = ${workoutId}
    `;
    if (!rows[0]) return null;
    // messaggi del coach non ancora visti dall'atleta (chat del report)
    try {
      const unread = await sql`
        SELECT COUNT(*)::int AS n FROM workout_report_messages m JOIN workout_reports r ON r.report_id = m.report_id
        WHERE m.report_id = ${rows[0].report_id} AND m.da_coach AND (r.letto_atleta_at IS NULL OR m.created_at > r.letto_atleta_at)
      `;
      rows[0].da_leggere = unread[0]?.n || 0;
    } catch { /* migrazione 20261130 non ancora applicata */ }
    return rows[0];
  } catch (error) {
    if (/workout_reports/.test(String(error?.message))) return null;
    throw error;
  }
}

// Esercizio di un allenamento dell'atleta loggato
async function ownedExercise(sql, user, exerciseId) {
  const rows = await sql`
    SELECT x.exercise_id, x.workout_id, x.nome, w.utenteid, w.tipo
    FROM calendar_workout_exercises x JOIN calendar_workouts w ON w.workout_id = x.workout_id
    WHERE x.exercise_id = ${exerciseId}
  `;
  const exercise = rows[0];
  if (!exercise || exercise.utenteid !== user.userId) return { error: 'Esercizio non trovato', status: 404 };
  if (exercise.tipo === 'endurance') return { error: 'I video di esecuzione sono per gli allenamenti di forza', status: 400 };
  return { exercise };
}

async function upsertExecution(sql, exercise, fields) {
  const rows = await sql`
    INSERT INTO esecuzioni_video (exercise_id, workout_id, utenteid, dubbi, storage_key, mime, size_bytes, updated_at)
    VALUES (${exercise.exercise_id}, ${exercise.workout_id}, ${exercise.utenteid}, ${fields.dubbi ?? null},
            ${fields.storage_key ?? null}, ${fields.mime ?? null}, ${fields.size_bytes ?? null}, NOW())
    ON CONFLICT (exercise_id) DO UPDATE SET
      dubbi = CASE WHEN ${'dubbi' in fields} THEN EXCLUDED.dubbi ELSE esecuzioni_video.dubbi END,
      storage_key = CASE WHEN ${'storage_key' in fields} THEN EXCLUDED.storage_key ELSE esecuzioni_video.storage_key END,
      mime = CASE WHEN ${'storage_key' in fields} THEN EXCLUDED.mime ELSE esecuzioni_video.mime END,
      size_bytes = CASE WHEN ${'storage_key' in fields} THEN EXCLUDED.size_bytes ELSE esecuzioni_video.size_bytes END,
      updated_at = NOW()
    RETURNING *
  `;
  return rows[0];
}

async function serialize(c, row) {
  return {
    esecuzione_id: row.esecuzione_id,
    exercise_id: row.exercise_id,
    dubbi: row.dubbi,
    video_url: row.storage_key ? await videoUrl(c, row.esecuzione_id, row.updated_at) : null,
    video_mime: row.mime,
    video_size: row.size_bytes,
    updated_at: row.updated_at,
  };
}

// PUT /reports/exercises/:id/dubbi { dubbi }
app.put('/exercises/:id{[0-9]+}/dubbi', async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'I dubbi li scrive l\'atleta' }, 403);
  const sql = db(c.env);
  const owned = await ownedExercise(sql, user, Number(c.req.param('id')));
  if (owned.error) return c.json({ message: owned.error }, owned.status);
  const { dubbi } = await c.req.json().catch(() => ({}));
  const text = String(dubbi ?? '').trim().slice(0, 2000) || null;
  const row = await upsertExecution(sql, owned.exercise, { dubbi: text });
  return c.json(await serialize(c, row));
});

// POST /reports/exercises/:id/video — corpo: il video (binario), Content-Type video/*
app.post('/exercises/:id{[0-9]+}/video', async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'Il video di esecuzione lo carica l\'atleta' }, 403);
  if (!c.env.CHECK_PHOTOS) return c.json({ message: 'Archivio video non configurato: collega il bucket R2 al Worker' }, 503);
  const sql = db(c.env);
  const owned = await ownedExercise(sql, user, Number(c.req.param('id')));
  if (owned.error) return c.json({ message: owned.error }, owned.status);

  const mime = String(c.req.header('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!VIDEO_MIME.test(mime)) return c.json({ message: 'Formato non supportato: carica un video (mp4, mov, webm)' }, 415);
  const declared = Number(c.req.header('content-length') || 0);
  if (declared > MAX_VIDEO_BYTES) return c.json({ message: 'Video troppo grande (massimo 90 MB): accorcialo o registralo a qualità più bassa' }, 413);

  // con la lunghezza nota il video va in streaming direttamente su R2, senza tenerlo in memoria
  let body;
  let size = declared;
  if (declared > 0 && c.req.raw.body) body = c.req.raw.body;
  else {
    body = new Uint8Array(await c.req.arrayBuffer());
    size = body.length;
    if (size > MAX_VIDEO_BYTES) return c.json({ message: 'Video troppo grande (massimo 90 MB)' }, 413);
  }
  if (!size) return c.json({ message: 'Video vuoto' }, 400);

  const { exercise } = owned;
  const previous = (await sql`SELECT storage_key FROM esecuzioni_video WHERE exercise_id = ${exercise.exercise_id}`)[0];
  const ext = { 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp' }[mime] || 'mp4';
  const key = `esecuzioni/${exercise.utenteid}/${exercise.workout_id}/${exercise.exercise_id}-${Date.now()}.${ext}`;
  await c.env.CHECK_PHOTOS.put(key, body, { httpMetadata: { contentType: mime } });
  const row = await upsertExecution(sql, exercise, { storage_key: key, mime, size_bytes: size });
  if (previous?.storage_key && previous.storage_key !== key) {
    try { await c.env.CHECK_PHOTOS.delete(previous.storage_key); } catch (error) { console.error('R2 delete', error.message); }
  }
  return c.json(await serialize(c, row), 201);
});

// DELETE /reports/exercises/:id/video
app.delete('/exercises/:id{[0-9]+}/video', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const owned = await ownedExercise(sql, user, Number(c.req.param('id')));
  if (owned.error) return c.json({ message: owned.error }, owned.status);
  const rows = await sql`SELECT * FROM esecuzioni_video WHERE exercise_id = ${owned.exercise.exercise_id}`;
  if (!rows[0]?.storage_key) return c.json({ message: 'Nessun video da eliminare' }, 404);
  if (c.env.CHECK_PHOTOS) {
    try { await c.env.CHECK_PHOTOS.delete(rows[0].storage_key); } catch (error) { console.error('R2 delete', error.message); }
  }
  const row = await upsertExecution(sql, owned.exercise, { storage_key: null, mime: null, size_bytes: null });
  return c.json(await serialize(c, row));
});

// GET /reports/execution/:id/file?t= — video con supporto Range (necessario per la riproduzione su iPhone)
app.get('/execution/:id{[0-9]+}/file', async (c) => {
  const esecuzioneId = Number(c.req.param('id'));
  try {
    const payload = await verify(c.req.query('t') || '', secret(c.env), 'HS256');
    if (payload.purpose !== 'exec-video' || payload.eid !== esecuzioneId) throw new Error('token');
  } catch {
    return c.json({ message: 'Link video scaduto: riapri la pagina' }, 403);
  }
  if (!c.env.CHECK_PHOTOS) return c.json({ message: 'Archivio video non configurato' }, 503);
  const sql = db(c.env);
  const row = (await sql`SELECT storage_key, mime FROM esecuzioni_video WHERE esecuzione_id = ${esecuzioneId}`)[0];
  if (!row?.storage_key) return c.json({ message: 'Video non trovato' }, 404);

  const rangeHeader = c.req.header('range');
  const head = await c.env.CHECK_PHOTOS.head(row.storage_key);
  if (!head) return c.json({ message: 'Video non trovato' }, 404);
  const total = head.size;
  const headers = {
    'Content-Type': row.mime || head.httpMetadata?.contentType || 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };
  const match = rangeHeader && rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (match && (match[1] || match[2])) {
    let start;
    let end;
    if (match[1] === '') { start = Math.max(0, total - Number(match[2])); end = total - 1; }
    else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1; }
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${total}` } });
    }
    const object = await c.env.CHECK_PHOTOS.get(row.storage_key, { range: { offset: start, length: end - start + 1 } });
    if (!object) return c.json({ message: 'Video non trovato' }, 404);
    return new Response(object.body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) },
    });
  }
  const object = await c.env.CHECK_PHOTOS.get(row.storage_key);
  if (!object) return c.json({ message: 'Video non trovato' }, 404);
  return new Response(object.body, { headers: { ...headers, 'Content-Length': String(total) } });
});

// Contenuto del report: fotografia dell'allenamento al momento dell'invio
async function buildSnapshot(sql, workout) {
  const exercises = await sql`
    SELECT x.exercise_id, x.nome, x.serie, x.ripetizioni, x.carico, x.recupero, x.note, x.note_atleta,
           e.dubbi, (e.storage_key IS NOT NULL) AS ha_video
    FROM calendar_workout_exercises x
    LEFT JOIN esecuzioni_video e ON e.exercise_id = x.exercise_id
    WHERE x.workout_id = ${workout.workout_id}
    ORDER BY x.order_index ASC, x.exercise_id ASC
  `;
  const feedback = (await sql`
    SELECT completato, rpe, sensazione, durata_effettiva_minuti, note FROM workout_feedback
    WHERE workout_id = ${workout.workout_id} AND utenteid = ${workout.utenteid} LIMIT 1
  `)[0] || null;
  return {
    workout: { workout_id: workout.workout_id, titolo: workout.titolo, data: workout.data, tipo: workout.tipo },
    feedback,
    esercizi: exercises.map((row) => ({ ...row, ha_video: !!row.ha_video })),
  };
}

// POST /reports { workoutId } — l'atleta invia (o reinvia) il report dell'allenamento al coach
app.post('/', async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'Il report lo invia l\'atleta' }, 403);
  const sql = db(c.env);
  const { workoutId } = await c.req.json().catch(() => ({}));
  const workout = (await sql`SELECT * FROM calendar_workouts WHERE workout_id = ${Number(workoutId)}`)[0];
  if (!workout || workout.utenteid !== user.userId) return c.json({ message: 'Allenamento non trovato' }, 404);
  const coachId = workout.coach_userid || await coachOf(sql, user.userId);
  if (!coachId) return c.json({ message: 'Non sei ancora collegato a un coach' }, 400);

  const snapshot = await buildSnapshot(sql, workout);
  const rows = await sql`
    INSERT INTO workout_reports (workout_id, athlete_id, coach_id, contenuto_json, inviato_at)
    VALUES (${workout.workout_id}, ${user.userId}, ${coachId}, ${JSON.stringify(snapshot)}, NOW())
    ON CONFLICT (workout_id) DO UPDATE SET
      contenuto_json = EXCLUDED.contenuto_json, coach_id = EXCLUDED.coach_id, inviato_at = NOW(), letto_at = NULL
    RETURNING report_id, inviato_at, letto_at, risposta, risposta_at
  `;
  const report = rows[0];
  const videos = snapshot.esercizi.filter((row) => row.ha_video).length;
  const doubts = snapshot.esercizi.filter((row) => String(row.dubbi || '').trim()).length;
  await notify(sql, coachId, {
    tipo: 'report',
    mittenteId: user.userId,
    titolo: `${await userName(sql, user.userId)} ti ha inviato il report di "${workout.titolo}"`,
    messaggio: [fmtDay(workout.data), videos ? `${videos} video` : null, doubts ? `${doubts} ${doubts === 1 ? 'dubbio' : 'dubbi'}` : null].filter(Boolean).join(' · '),
    link: { screen: 'ReportDetail', params: { reportId: report.report_id } },
  });
  return c.json(report, 201);
});

// GET /reports?utenteId= — coach: report ricevuti (filtrabili per atleta); atleta: i propri
app.get('/', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const athleteFilter = c.req.query('utenteId') ? Number(c.req.query('utenteId')) : null;
  const chatReady = await hasReportChat(sql);
  const rows = user.ruolo === 'personal_trainer'
    ? await sql`
        SELECT r.report_id, r.workout_id, r.athlete_id, TRIM(CONCAT_WS(' ', u.nome, u.cognome)) AS atleta, w.titolo, w.data, r.inviato_at, r.letto_at, r.risposta_at,
               r.contenuto_json
        FROM workout_reports r
        JOIN utenti u ON u.utenteid = r.athlete_id
        JOIN calendar_workouts w ON w.workout_id = r.workout_id
        WHERE (r.coach_id = ${user.userId}
               OR r.athlete_id IN (SELECT cliente_userid FROM pt_clienti WHERE pt_userid = ${user.userId} AND attivo = 1))
          AND (${athleteFilter}::int IS NULL OR r.athlete_id = ${athleteFilter})
        ORDER BY (r.letto_at IS NULL) DESC, r.inviato_at DESC
        LIMIT 200`
    : await sql`
        SELECT r.report_id, r.workout_id, r.athlete_id, w.titolo, w.data, r.inviato_at, r.letto_at, r.risposta_at, r.contenuto_json
        FROM workout_reports r JOIN calendar_workouts w ON w.workout_id = r.workout_id
        WHERE r.athlete_id = ${user.userId}
        ORDER BY r.inviato_at DESC LIMIT 200`;
  // chat: report con messaggi non ancora visti (dell'atleta per il coach, del coach per l'atleta)
  let unread = new Set();
  if (chatReady && rows.length) {
    const ids = rows.map((row) => row.report_id);
    const coachSide = user.ruolo !== 'cliente';
    const flagged = await sql`
      SELECT DISTINCT r.report_id FROM workout_reports r JOIN workout_report_messages m ON m.report_id = r.report_id
      WHERE r.report_id = ANY(${ids}) AND m.da_coach = ${!coachSide}
        AND m.created_at > COALESCE(CASE WHEN ${coachSide} THEN r.letto_coach_at ELSE r.letto_atleta_at END, '-infinity'::timestamptz)
    `;
    unread = new Set(flagged.map((row) => row.report_id));
  }
  return c.json(rows.map(({ contenuto_json: json, ...row }) => {
    let content = {};
    try { content = JSON.parse(json || '{}'); } catch { content = {}; }
    const exercises = content.esercizi || [];
    return {
      ...row,
      nuovi_messaggi: unread.has(row.report_id),
      n_esercizi: exercises.length,
      n_video: exercises.filter((item) => item.ha_video).length,
      n_dubbi: exercises.filter((item) => String(item.dubbi || '').trim()).length,
      rpe: content.feedback?.rpe ?? null,
      sensazione: content.feedback?.sensazione ?? null,
    };
  }));
});

// GET /reports/:id — dettaglio; quando lo apre il coach viene segnato come letto
app.get('/:id{[0-9]+}', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const report = (await sql`
    SELECT r.*, TRIM(CONCAT_WS(' ', u.nome, u.cognome)) AS atleta, w.titolo, w.data, w.tipo
    FROM workout_reports r JOIN utenti u ON u.utenteid = r.athlete_id JOIN calendar_workouts w ON w.workout_id = r.workout_id
    WHERE r.report_id = ${Number(c.req.param('id'))}
  `)[0];
  if (!report || !await assertAccessToAthlete(sql, user, report.athlete_id)) return c.json({ message: 'Report non trovato' }, 404);
  if (user.ruolo === 'personal_trainer' && !report.letto_at) {
    await sql`UPDATE workout_reports SET letto_at = NOW() WHERE report_id = ${report.report_id}`;
    report.letto_at = new Date().toISOString();
  }
  let content = {};
  try { content = JSON.parse(report.contenuto_json || '{}'); } catch { content = {}; }
  // video e dubbi sempre aggiornati (l'atleta puo' averli cambiati dopo l'invio)
  const live = await executionsFor(c, sql, report.workout_id);
  // serie fatte (ripetizioni e kg) registrate dall'atleta: sempre aggiornate, anche se le ha inserite dopo l'invio
  // Il report salva gli esercizi al momento dell'invio: se poi il coach modifica l'allenamento gli esercizi
  // vengono ricreati con un altro id, quindi serie, video e dubbi si cercano anche per nome.
  const nameKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  let logged = new Map();
  const currentByName = new Map();
  try {
    const rows = await sql`SELECT exercise_id, nome, serie_eseguite_json FROM calendar_workout_exercises WHERE workout_id = ${report.workout_id}`;
    logged = new Map(rows.map((row) => [row.exercise_id, safeSets(row.serie_eseguite_json)]));
    rows.forEach((row) => { if (!currentByName.has(nameKey(row.nome))) currentByName.set(nameKey(row.nome), row.exercise_id); });
  } catch {
    try {
      const rows = await sql`SELECT exercise_id, nome FROM calendar_workout_exercises WHERE workout_id = ${report.workout_id}`;
      rows.forEach((row) => { if (!currentByName.has(nameKey(row.nome))) currentByName.set(nameKey(row.nome), row.exercise_id); });
    } catch { /* ignore */ }
  }
  const currentId = (exercise) => (logged.has(exercise.exercise_id) || live[exercise.exercise_id] ? exercise.exercise_id : currentByName.get(nameKey(exercise.nome)) ?? exercise.exercise_id);
  // in mancanza, le serie registrate dall'orologio (file .fit / Garmin)
  let watchSets = [];
  if (![...logged.values()].some((sets) => sets.length)) {
    try {
      const stream = (await sql`SELECT samples_json FROM activity_streams WHERE workout_id = ${report.workout_id}`)[0];
      const samples = stream?.samples_json ? JSON.parse(stream.samples_json) : null;
      watchSets = exercisesFromFileSets(samples?.sets || []);
    } catch { watchSets = []; }
  }
  const { contenuto_json: _json, ...rest } = report;
  return c.json({
    ...rest,
    feedback: content.feedback || null,
    esercizi: (content.esercizi || []).map((exercise) => {
      const id = currentId(exercise);
      return {
        ...exercise,
        dubbi: live[id]?.dubbi ?? exercise.dubbi ?? null,
        video_url: live[id]?.video_url || null,
        serie_eseguite: logged.get(id) || [],
      };
    }),
    serie_orologio: watchSets,
  });
});

// ---------- chat del report: botta e risposta atleta <-> coach con conferma di lettura ----------
let reportChatChecked = null;
async function hasReportChat(sql) {
  if (reportChatChecked !== null) return reportChatChecked;
  try {
    await sql`SELECT letto_coach_at FROM workout_reports LIMIT 0`;
    await sql`SELECT 1 FROM workout_report_messages LIMIT 0`;
    reportChatChecked = true;
  } catch {
    return false; // migrazione 20261130 non ancora applicata: si riprova alla prossima richiesta
  }
  return reportChatChecked;
}

async function reportForChat(sql, user, id) {
  const report = (await sql`
    SELECT r.*, w.titolo FROM workout_reports r JOIN calendar_workouts w ON w.workout_id = r.workout_id WHERE r.report_id = ${id}
  `)[0];
  if (!report || !await assertAccessToAthlete(sql, user, report.athlete_id)) return null;
  return report;
}

// GET /reports/:id/messages — aprire la chat segna come visti i messaggi dell'altra parte
app.get('/:id{[0-9]+}/messages', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const report = await reportForChat(sql, user, Number(c.req.param('id')));
  if (!report) return c.json({ message: 'Report non trovato' }, 404);
  if (!await hasReportChat(sql)) {
    const legacy = report.risposta ? [{ message_id: 0, da_coach: true, testo: report.risposta, created_at: report.risposta_at }] : [];
    return c.json({ messages: legacy, letto_coach_at: null, letto_atleta_at: null });
  }
  const messages = await sql`
    SELECT message_id, da_coach, testo, created_at FROM workout_report_messages WHERE report_id = ${report.report_id}
    ORDER BY created_at ASC, message_id ASC
  `;
  const read = user.ruolo === 'cliente'
    ? await sql`UPDATE workout_reports SET letto_atleta_at = NOW() WHERE report_id = ${report.report_id} RETURNING letto_coach_at, letto_atleta_at`
    : await sql`UPDATE workout_reports SET letto_coach_at = NOW(), letto_at = COALESCE(letto_at, NOW()) WHERE report_id = ${report.report_id} RETURNING letto_coach_at, letto_atleta_at`;
  return c.json({ messages, ...read[0] });
});

// POST /reports/:id/messages { testo } — messaggio dell'atleta o del coach; l'altra parte riceve notifica (ed email)
app.post('/:id{[0-9]+}/messages', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const report = await reportForChat(sql, user, Number(c.req.param('id')));
  if (!report) return c.json({ message: 'Report non trovato' }, 404);
  if (!await hasReportChat(sql)) return c.json({ message: 'Chat non ancora attiva: va applicata la migrazione 20261130' }, 503);
  const { testo } = await c.req.json().catch(() => ({}));
  const text = String(testo ?? '').trim().slice(0, 4000);
  if (!text) return c.json({ message: 'Scrivi un messaggio' }, 400);
  const fromCoach = user.ruolo !== 'cliente';
  const message = (await sql`
    INSERT INTO workout_report_messages (report_id, autore_id, da_coach, testo)
    VALUES (${report.report_id}, ${user.userId}, ${fromCoach}, ${text})
    RETURNING message_id, da_coach, testo, created_at
  `)[0];
  if (fromCoach) {
    // compatibilita': ultima risposta del coach anche nei campi del report
    await sql`
      UPDATE workout_reports SET risposta = ${text}, risposta_at = NOW(), letto_at = COALESCE(letto_at, NOW()), letto_coach_at = NOW()
      WHERE report_id = ${report.report_id}
    `;
    await notify(sql, report.athlete_id, {
      tipo: 'report_risposta',
      mittenteId: user.userId,
      titolo: `Il coach ti ha scritto sul report di "${report.titolo}"`,
      messaggio: text.slice(0, 160),
      link: { screen: 'WorkoutDetail', params: { workoutId: report.workout_id } },
    });
  } else {
    await sql`UPDATE workout_reports SET letto_atleta_at = NOW() WHERE report_id = ${report.report_id}`;
    const coachId = report.coach_id || await coachOf(sql, report.athlete_id);
    if (coachId) {
      await notify(sql, coachId, {
        tipo: 'report',
        mittenteId: user.userId,
        titolo: `${await userName(sql, user.userId)} ha risposto sul report di "${report.titolo}"`,
        messaggio: text.slice(0, 160),
        link: { screen: 'ReportDetail', params: { reportId: report.report_id } },
      });
    }
  }
  return c.json(message, 201);
});

// PUT /reports/:id/risposta { testo } — il coach risponde all'atleta (vecchie versioni dell'app)
app.put('/:id{[0-9]+}/risposta', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const report = (await sql`
    SELECT r.*, w.titolo FROM workout_reports r JOIN calendar_workouts w ON w.workout_id = r.workout_id
    WHERE r.report_id = ${Number(c.req.param('id'))}
  `)[0];
  if (!report || !await assertAccessToAthlete(sql, user, report.athlete_id)) return c.json({ message: 'Report non trovato' }, 404);
  const { testo } = await c.req.json().catch(() => ({}));
  const text = String(testo ?? '').trim().slice(0, 4000);
  if (!text) return c.json({ message: 'Scrivi una risposta' }, 400);
  const rows = await sql`
    UPDATE workout_reports SET risposta = ${text}, risposta_at = NOW(), letto_at = COALESCE(letto_at, NOW())
    WHERE report_id = ${report.report_id}
    RETURNING report_id, risposta, risposta_at, letto_at
  `;
  if (await hasReportChat(sql)) {
    await sql`INSERT INTO workout_report_messages (report_id, autore_id, da_coach, testo) VALUES (${report.report_id}, ${user.userId}, TRUE, ${text})`;
  }
  await notify(sql, report.athlete_id, {
    tipo: 'report_risposta',
    mittenteId: user.userId,
    titolo: `Il coach ha risposto al report di "${report.titolo}"`,
    messaggio: text.slice(0, 160),
    link: { screen: 'WorkoutDetail', params: { workoutId: report.workout_id } },
  });
  return c.json(rows[0]);
});

export default app;
