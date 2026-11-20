import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { assertCoachOwnsAthlete } from '../utils.js';
import { loadWorkoutsWithLoad, loadMergedZones } from '../lib/athleteData.js';
import { notify, coachOf, userName, notifyNewWorkout } from '../lib/notify.js';
import { isoDay, zoneSecondsFromSamples, todayIso, addDaysIso } from '../lib/trainingLoad.js';
import { executionsFor, reportFor } from './reports.js';

const app = new Hono();
app.use('*', authenticate());

// Un coach puo' modificare solo i workout degli atleti che segue.
async function loadOwnedWorkout(sql, user, id) {
  const rows = await sql`SELECT * FROM calendar_workouts WHERE workout_id = ${id}`;
  const workout = rows[0];
  if (!workout) return { error: 'Workout non trovato', status: 404 };
  if (workout.coach_userid !== user.userId && !await assertCoachOwnsAthlete(sql, user.userId, workout.utenteid)) {
    return { error: 'Accesso negato', status: 403 };
  }
  return { workout };
}

app.post('/functional', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { utenteId, data, titolo, descrizione, durataMinuti, rpePianificato, esercizi = [] } = await c.req.json();
  if (!utenteId || !data || !titolo) return c.json({ message: 'utenteId, data e titolo sono richiesti' }, 400);
  const sql = db(c.env);
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);
  const inserted = await sql`
    INSERT INTO calendar_workouts (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, rpe_pianificato, stato)
    VALUES (${utenteId}, ${user.userId}, ${data}, 'funzionale', ${titolo}, ${descrizione || null}, ${durataMinuti || null},
            ${durataMinuti ? Number(durataMinuti) * 60 : null}, ${rpePianificato || null}, 'pianificato')
    RETURNING *
  `;
  for (let index = 0; index < esercizi.length; index += 1) {
    const exercise = esercizi[index];
    if (!exercise?.nome) continue;
    await sql`
      INSERT INTO calendar_workout_exercises (workout_id, nome, ripetizioni, carico, note, video_url, order_index)
      VALUES (${inserted[0].workout_id}, ${exercise.nome}, ${exercise.ripetizioni || null}, ${exercise.carico || null}, ${exercise.note || null}, ${exercise.videoUrl || null}, ${index})
    `;
  }
  await notifyNewWorkout(sql, inserted[0], user.userId);
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
      -- la scheda viene espansa una sola volta: le occorrenze eliminate dal coach non ricompaiono
      AND NOT EXISTS (
        SELECT 1 FROM calendar_workouts w
        WHERE w.schedaid = s.schedaid
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
      (utenteid, coach_userid, endurance_session_id, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, rpe_pianificato, sport, stato)
    SELECT p.user_id, NULL, s.session_id,
           COALESCE(
             s."date"::date,
             p.start_date::date + (
               (ROW_NUMBER() OVER (PARTITION BY p.plan_id ORDER BY s.session_id) - 1) * 7
             )::int
           ),
           'endurance', s.title, s.description, s.duration_minutes, s.duration_seconds, s.rpe_target, s.sport, 'pianificato'
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
    if (!await assertCoachOwnsAthlete(sql, user.userId, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  }

  const fromDate = from || '1970-01-01';
  const toDate = to || '2999-12-31';

  // La generazione delle occorrenze da schede/piani non deve mai svuotare il calendario
  try {
    await syncSourceWorkouts(sql, utenteId, true);
  } catch (error) {
    console.error('syncSourceWorkouts', utenteId, error?.message);
  }

  // Ogni workout include "load": TRIMP/tempo/km pianificati ed eseguiti e profilo zone (stile CoachPeaking)
  const workouts = await loadWorkoutsWithLoad(sql, utenteId, fromDate, toDate);
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

  // Il video arriva dalla libreria del coach: prima quello collegato all'esercizio del catalogo
  // (stesso nome, maiuscole/spazi ignorati), altrimenti un video non collegato con lo stesso titolo.
  // Se la migrazione 20261118 (note_atleta) non e' ancora stata applicata la scheda deve comunque comparire.
  let rows;
  try {
    rows = await sql`
    SELECT s.*, e.esercizioid AS esercizioid, e.nomeesercizio, e.serie, e.ripetizioni,
           e.descrizione AS exercise_description, e.recupero, e.noteutente, e.videourl AS legacy_video_url,
           e.note_atleta, e.note_atleta_at,
           vid.videoid, vid.titolo AS video_title, vid.videourl AS catalog_video_url
    FROM schedeallenamento s
    LEFT JOIN esercizischeda e ON e.schedaid = s.schedaid
    LEFT JOIN LATERAL (
      SELECT v.videoid, v.titolo, v.videourl
      FROM videotutorial v
      LEFT JOIN esercizifull ef ON ef.esercizioid = v.esercizioid
      WHERE e.nomeesercizio IS NOT NULL AND (
        LOWER(TRIM(ef.nomeesercizio)) = LOWER(TRIM(e.nomeesercizio))
        OR (v.esercizioid IS NULL AND LOWER(TRIM(v.titolo)) = LOWER(TRIM(e.nomeesercizio)))
      )
      ORDER BY (ef.esercizioid IS NOT NULL) DESC, v.videoid DESC
      LIMIT 1
    ) vid ON TRUE
    WHERE s.utenteid = ${utenteId}
    ORDER BY s.datainizio ASC NULLS LAST, s.schedaid ASC, e.esercizioid ASC
  `;
  } catch (error) {
    if (!/note_atleta/.test(String(error?.message))) throw error;
    rows = await sql`
    SELECT s.*, e.esercizioid AS esercizioid, e.nomeesercizio, e.serie, e.ripetizioni,
           e.descrizione AS exercise_description, e.recupero, e.noteutente, e.videourl AS legacy_video_url,
           NULL::text AS note_atleta, NULL::timestamp AS note_atleta_at,
           vid.videoid, vid.titolo AS video_title, vid.videourl AS catalog_video_url
    FROM schedeallenamento s
    LEFT JOIN esercizischeda e ON e.schedaid = s.schedaid
    LEFT JOIN LATERAL (
      SELECT v.videoid, v.titolo, v.videourl
      FROM videotutorial v
      LEFT JOIN esercizifull ef ON ef.esercizioid = v.esercizioid
      WHERE e.nomeesercizio IS NOT NULL AND (
        LOWER(TRIM(ef.nomeesercizio)) = LOWER(TRIM(e.nomeesercizio))
        OR (v.esercizioid IS NULL AND LOWER(TRIM(v.titolo)) = LOWER(TRIM(e.nomeesercizio)))
      )
      ORDER BY (ef.esercizioid IS NOT NULL) DESC, v.videoid DESC
      LIMIT 1
    ) vid ON TRUE
    WHERE s.utenteid = ${utenteId}
    ORDER BY s.datainizio ASC NULLS LAST, s.schedaid ASC, e.esercizioid ASC
  `;
  }
  // Per ogni giorno della scheda: quando e' stato fatto l'ultima volta e quando e' il prossimo in programma
  const today = todayIso();
  const statsRows = await sql`
    SELECT schedaid,
           MAX(data) FILTER (WHERE stato = 'completato') AS ultima_volta,
           MIN(data) FILTER (WHERE stato <> 'completato' AND data >= ${today}) AS prossima_volta,
           COUNT(*) FILTER (WHERE stato = 'completato')::int AS volte
    FROM calendar_workouts WHERE utenteid = ${utenteId} AND schedaid IS NOT NULL
    GROUP BY schedaid
  `;
  const dayStats = new Map(statsRows.map((row) => [row.schedaid, { ultima_volta: row.ultima_volta ? isoDay(row.ultima_volta) : null, prossima_volta: row.prossima_volta ? isoDay(row.prossima_volta) : null, volte: row.volte }]));
  const groups = new Map();
  for (const row of rows) {
    const match = String(row.nomescheda || '').match(/^(.*?)(?:\s+-\s+Giorno\s+([A-Za-z0-9]+))?$/i);
    const name = (match?.[1] || row.nomescheda || 'Scheda palestra').trim();
    if (!groups.has(name)) groups.set(name, { nome: name, datainizio: row.datainizio, datafine: row.datafine, programmazione: row.programmazione || 'settimanale', giorni: new Map() });
    const group = groups.get(name);
    const dayName = match?.[2] ? `Giorno ${match[2]}` : 'Giorno 1';
    if (!group.giorni.has(row.schedaid)) {
      const stats = dayStats.get(row.schedaid) || {};
      group.giorni.set(row.schedaid, { schedaid: row.schedaid, nome: dayName, data: row.datainizio, esercizi: [], ultima_volta: stats.ultima_volta || null, prossima_volta: stats.prossima_volta || null, volte: stats.volte || 0 });
    }
    if (row.nomeesercizio && !group.giorni.get(row.schedaid).esercizi.some((exercise) => exercise.esercizioid === row.esercizioid)) {
      group.giorni.get(row.schedaid).esercizi.push({
        esercizioid: row.esercizioid, nome: row.nomeesercizio, serie: row.serie, ripetizioni: row.ripetizioni,
        descrizione: row.exercise_description, recupero: row.recupero, note: row.noteutente,
        video_url: row.legacy_video_url || row.catalog_video_url, video_title: row.video_title,
        note_atleta: row.note_atleta, note_atleta_at: row.note_atleta_at,
      });
    }
  }
  return c.json([...groups.values()].map((group) => ({ ...group, giorni: [...group.giorni.values()] })));
});

// Giorni della settimana dal profilo atleta ("Lunedi, Mercoledi, ...") -> numeri 1 (lun) .. 7 (dom)
const WEEKDAYS = { lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6, domenica: 7 };
export function parseWeekdays(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map((item) => {
    if (Number.isInteger(Number(item)) && Number(item) >= 1 && Number(item) <= 7) return Number(item);
    const key = String(item).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return WEEKDAYS[key] || WEEKDAYS[Object.keys(WEEKDAYS).find((name) => key && name.startsWith(key.slice(0, 3)))] || null;
  }).filter(Boolean))].sort();
}

const isoWeekday = (iso) => { const day = new Date(`${iso}T12:00:00Z`).getUTCDay(); return day === 0 ? 7 : day; };

// Programmazione automatica: i giorni della scheda (A, B, C...) si susseguono sui giorni disponibili
// dell'atleta, al massimo un ciclo di allenamenti a settimana. Es. lun-ven + scheda di 4 giorni:
// lun A, mar B, mer C, gio D, ven riposo; la settimana dopo si riparte da dove si era rimasti.
export function autoSchedule(start, end, weekdays, dayCount) {
  const available = new Set(weekdays);
  const weeklyCap = Math.min(dayCount, available.size);
  const out = [];
  let next = 0;
  let weekKey = null;
  let inWeek = 0;
  for (let day = start; day <= end && out.length < 400; day = addDaysIso(day, 1)) {
    const weekday = isoWeekday(day);
    const monday = addDaysIso(day, -(weekday - 1));
    if (monday !== weekKey) { weekKey = monday; inWeek = 0; }
    if (!available.has(weekday) || inWeek >= weeklyCap) continue;
    out.push({ data: day, giorno: next });
    next = (next + 1) % dayCount;
    inWeek += 1;
  }
  return out;
}

app.post('/strength-sheets', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { utenteId, nome, dataInizio, datafine, giorni = [], programmazione, giorniSettimana } = await c.req.json();
  const auto = programmazione === 'auto';
  if (!utenteId || !nome?.trim() || !dataInizio || !datafine || datafine < dataInizio || !Array.isArray(giorni) || !giorni.length || giorni.length > 7) {
    return c.json({ message: 'Nome, data inizio, data scadenza e da 1 a 7 giorni sono richiesti' }, 400);
  }
  const weekdays = auto ? parseWeekdays(giorniSettimana) : [];
  if (auto && !weekdays.length) return c.json({ message: 'Per la programmazione automatica servono i giorni di allenamento dell\'atleta' }, 400);
  const sql = db(c.env);
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);
  const created = [];
  for (let index = 0; index < giorni.length; index += 1) {
    const day = giorni[index] || {};
    if (!auto && !day.data) continue;
    const sheet = await sql`
      INSERT INTO schedeallenamento (utenteid, nomescheda, datainizio, datafine, attiva, notegenerali)
      VALUES (${utenteId}, ${`${nome.trim()} - Giorno ${index + 1}`}, ${auto ? dataInizio : (day.data || dataInizio)}, ${datafine}, 1, ${day.note || null})
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

  let occurrences = 0;
  if (auto && created.length) {
    try {
      await sql`UPDATE schedeallenamento SET programmazione = 'auto' WHERE schedaid = ANY(${created.map((row) => row.schedaid)})`;
    } catch (error) {
      console.error('programmazione non salvata (migrazione 20261122?)', error?.message);
    }
    // Le occorrenze vengono create subito: la sync del calendario non le ricalcola (la scheda ha gia' allenamenti)
    for (const entry of autoSchedule(dataInizio, datafine, weekdays, created.length)) {
      const sheetRow = created[entry.giorno];
      await sql`
        INSERT INTO calendar_workouts (utenteid, coach_userid, schedaid, data, tipo, titolo, descrizione, stato)
        VALUES (${utenteId}, ${user.userId}, ${sheetRow.schedaid}, ${entry.data}, 'forza', ${sheetRow.nomescheda}, ${sheetRow.notegenerali || null}, 'pianificato')
      `;
      occurrences += 1;
    }
    await syncSourceWorkouts(sql, Number(utenteId), true); // aggiunge gli esercizi agli allenamenti appena creati
  }
  await notify(sql, Number(utenteId), {
    tipo: 'workout',
    mittenteId: user.userId,
    titolo: `Nuova scheda di pesistica: ${nome.trim()}`,
    messaggio: `${created.length} giorni · dal ${dataInizio.split('-').reverse().join('/')} al ${datafine.split('-').reverse().join('/')}`,
    link: { screen: 'StrengthHome', params: {} },
  });
  return c.json({ nome: nome.trim(), giorni: created, programmazione: auto ? 'auto' : 'settimanale', occorrenze: occurrences }, 201);
});

// POST /calendar/strength-sheets/log { schedaid, data } — l'atleta segna quale giorno della scheda ha fatto in una data.
// Se in quella settimana c'era gia' quel giorno in programma (non ancora fatto) viene spostato alla data indicata,
// altrimenti viene aggiunto. Restituisce l'allenamento da aprire per il feedback.
app.post('/strength-sheets/log', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const { schedaid, data } = await c.req.json().catch(() => ({}));
  if (!schedaid || !/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return c.json({ message: 'Giorno della scheda e data sono richiesti' }, 400);
  const sheet = (await sql`SELECT * FROM schedeallenamento WHERE schedaid = ${Number(schedaid)}`)[0];
  if (!sheet) return c.json({ message: 'Scheda non trovata' }, 404);
  const allowed = user.ruolo === 'cliente' ? sheet.utenteid === user.userId : await assertCoachOwnsAthlete(sql, user.userId, sheet.utenteid);
  if (!allowed) return c.json({ message: 'Accesso negato' }, 403);
  if (data > addDaysIso(todayIso(), 1)) return c.json({ message: 'Puoi registrare solo allenamenti di oggi o dei giorni passati' }, 400);

  const same = (await sql`SELECT workout_id FROM calendar_workouts WHERE schedaid = ${sheet.schedaid} AND data = ${data} LIMIT 1`)[0];
  if (same) return c.json({ workout_id: same.workout_id, azione: 'esistente', message: 'Questo giorno era già in programma in quella data' });

  const weekday = isoWeekday(data);
  const monday = addDaysIso(data, -(weekday - 1));
  const sunday = addDaysIso(monday, 6);
  const planned = (await sql`
    SELECT workout_id, data FROM calendar_workouts
    WHERE schedaid = ${sheet.schedaid} AND stato <> 'completato' AND data BETWEEN ${monday} AND ${sunday}
    ORDER BY ABS(data - ${data}::date) ASC LIMIT 1
  `)[0];
  if (planned) {
    await sql`UPDATE calendar_workouts SET data = ${data}, updated_at = NOW() WHERE workout_id = ${planned.workout_id}`;
    return c.json({ workout_id: planned.workout_id, azione: 'spostato', da: isoDay(planned.data), message: `Spostato dal ${isoDay(planned.data).split('-').reverse().slice(0, 2).join('/')} al ${data.split('-').reverse().slice(0, 2).join('/')}` });
  }
  const coachId = user.ruolo === 'personal_trainer' ? user.userId : await coachOf(sql, sheet.utenteid);
  const inserted = await sql`
    INSERT INTO calendar_workouts (utenteid, coach_userid, schedaid, data, tipo, titolo, descrizione, stato)
    VALUES (${sheet.utenteid}, ${coachId}, ${sheet.schedaid}, ${data}, 'forza', ${sheet.nomescheda}, ${sheet.notegenerali || null}, 'pianificato')
    RETURNING workout_id
  `;
  await syncSourceWorkouts(sql, sheet.utenteid, true); // copia gli esercizi del giorno
  return c.json({ workout_id: inserted[0].workout_id, azione: 'aggiunto', message: 'Allenamento aggiunto al calendario' }, 201);
});

// GET /calendar/home?utenteId= — Home dell'atleta: allenamenti di oggi e prossimi, scheda attiva, messaggi del coach
app.get('/home', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  let utenteId = user.userId;
  if (user.ruolo === 'personal_trainer') {
    utenteId = Number(c.req.query('utenteId'));
    if (!utenteId || !await assertCoachOwnsAthlete(sql, user.userId, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  }
  const today = todayIso();
  try { await syncSourceWorkouts(sql, utenteId, true); } catch (error) { console.error('home sync', error?.message); }
  const workouts = await loadWorkoutsWithLoad(sql, utenteId, today, addDaysIso(today, 7));
  const training = workouts.filter((workout) => workout.load || workout.tipo === 'forza');
  const oggi = training.filter((workout) => isoDay(workout.data) === today);
  const prossimi = training.filter((workout) => isoDay(workout.data) > today && workout.stato !== 'completato').slice(0, 4);

  const sheetRows = await sql`
    SELECT schedaid, nomescheda, datainizio, datafine FROM schedeallenamento
    WHERE utenteid = ${utenteId} AND datainizio <= ${today} AND (datafine IS NULL OR datafine >= ${today})
    ORDER BY schedaid ASC
  `;
  const sheets = new Map();
  for (const row of sheetRows) {
    const match = String(row.nomescheda || '').match(/^(.*?)(?:\s+-\s+Giorno\s+([A-Za-z0-9]+))?$/i);
    const name = (match?.[1] || row.nomescheda || 'Scheda').trim();
    if (!sheets.has(name)) sheets.set(name, { nome: name, datafine: row.datafine, giorni: [] });
    sheets.get(name).giorni.push({ schedaid: row.schedaid, nome: match?.[2] ? `Giorno ${match[2]}` : 'Giorno 1' });
  }

  // Dal coach: consigli, risposte ai report, commenti ai check (gli ultimi, dal piu' recente)
  const feed = [];
  const safe = async (query) => { try { return await query(); } catch (error) { console.error('home feed', error?.message); return []; } };
  for (const tip of await safe(() => sql`SELECT tip_id, testo, created_at FROM coach_tips WHERE athlete_id = ${utenteId} ORDER BY created_at DESC LIMIT 5`)) {
    feed.push({ id: `tip-${tip.tip_id}`, tipo: 'consiglio', titolo: 'Consiglio del coach', testo: tip.testo, data: tip.created_at });
  }
  for (const report of await safe(() => sql`
    SELECT r.report_id, r.workout_id, r.risposta, r.risposta_at, w.titolo FROM workout_reports r JOIN calendar_workouts w ON w.workout_id = r.workout_id
    WHERE r.athlete_id = ${utenteId} AND r.risposta IS NOT NULL ORDER BY r.risposta_at DESC LIMIT 5`)) {
    feed.push({ id: `rep-${report.report_id}`, tipo: 'report', titolo: `Risposta al report di "${report.titolo}"`, testo: report.risposta, data: report.risposta_at, link: { screen: 'WorkoutDetail', params: { workoutId: report.workout_id } } });
  }
  for (const check of await safe(() => sql`
    SELECT check_id, commento_coach, revisionato_at FROM body_checks
    WHERE athlete_id = ${utenteId} AND commento_coach IS NOT NULL AND commento_coach <> '' ORDER BY revisionato_at DESC NULLS LAST LIMIT 3`)) {
    feed.push({ id: `chk-${check.check_id}`, tipo: 'check', titolo: 'Commento al check fotografico', testo: check.commento_coach, data: check.revisionato_at, link: { screen: 'CheckDetail', params: { checkId: check.check_id } } });
  }
  feed.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));

  return c.json({ oggi: today, allenamenti_oggi: oggi, prossimi, schede_attive: [...sheets.values()], dal_coach: feed.slice(0, 8) });
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

// PUT /calendar/exercise-notes { source: 'scheda' | 'workout', id, note }
// L'atleta salva le proprie note sul singolo esercizio (carichi usati, sensazioni, dubbi per il coach).
app.put('/exercise-notes', async (c) => {
  const user = c.get('user');
  if (user.ruolo !== 'cliente') return c.json({ message: 'Le note esercizio le scrive l\'atleta' }, 403);
  const { source, id, note } = await c.req.json().catch(() => ({}));
  const text = String(note ?? '').trim().slice(0, 2000) || null;
  const sql = db(c.env);
  let rows;
  try {
  if (source === 'scheda') {
    rows = await sql`
      UPDATE esercizischeda e SET note_atleta = ${text}, note_atleta_at = NOW()
      FROM schedeallenamento s
      WHERE e.esercizioid = ${Number(id)} AND s.schedaid = e.schedaid AND s.utenteid = ${user.userId}
      RETURNING e.esercizioid AS id, e.note_atleta, e.note_atleta_at
    `;
  } else {
    rows = await sql`
      UPDATE calendar_workout_exercises x SET note_atleta = ${text}, note_atleta_at = NOW()
      FROM calendar_workouts w
      WHERE x.exercise_id = ${Number(id)} AND w.workout_id = x.workout_id AND w.utenteid = ${user.userId}
      RETURNING x.exercise_id AS id, x.note_atleta, x.note_atleta_at
    `;
  }
  } catch (error) {
    if (/note_atleta/.test(String(error?.message))) return c.json({ message: 'Note non ancora attive: va applicata la migrazione 20261118_esercizi_note_video.sql' }, 503);
    throw error;
  }
  if (!rows[0]) return c.json({ message: 'Esercizio non trovato' }, 404);
  return c.json(rows[0]);
});

// Dati campione dell'attivita' (import da file) + tempo trascorso in ogni zona FC dell'atleta
async function loadStreams(sql, workout) {
  let row;
  try {
    row = (await sql`SELECT samples_json, laps_json FROM activity_streams WHERE workout_id = ${workout.workout_id}`)[0];
  } catch (error) {
    if (/activity_streams/.test(String(error?.message))) return null; // migrazione non ancora applicata
    throw error;
  }
  if (!row?.samples_json) return null;
  let samples;
  let laps = [];
  try { samples = JSON.parse(row.samples_json); } catch { return null; }
  try { laps = JSON.parse(row.laps_json || '[]'); } catch { laps = []; }
  let hrZones = [];
  try { hrZones = (await loadMergedZones(sql, workout.utenteid)).heartRate || []; } catch { hrZones = []; }
  const zoneSeconds = zoneSecondsFromSamples(samples, hrZones);
  return {
    ...samples,
    laps,
    zone_fc: hrZones.map((zone) => ({ key: zone.key, min: zone.min, max: zone.max })),
    secondi_zona_fc: zoneSeconds,
  };
}

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

  // Se all'esercizio non e' stato associato un video, usa quello della libreria con lo stesso nome
  const exercises = await sql`
    SELECT x.*, COALESCE(NULLIF(x.video_url, ''), (
      SELECT v.videourl FROM videotutorial v
      LEFT JOIN esercizifull ef ON ef.esercizioid = v.esercizioid
      WHERE LOWER(TRIM(ef.nomeesercizio)) = LOWER(TRIM(x.nome))
         OR (v.esercizioid IS NULL AND LOWER(TRIM(v.titolo)) = LOWER(TRIM(x.nome)))
      ORDER BY (ef.esercizioid IS NOT NULL) DESC, v.videoid DESC LIMIT 1
    )) AS video_url
    FROM calendar_workout_exercises x WHERE x.workout_id = ${id} ORDER BY x.order_index ASC, x.exercise_id ASC
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
  const day = isoDay(workout.data);
  const withLoad = (await loadWorkoutsWithLoad(sql, workout.utenteid, day, day)).find((row) => row.workout_id === id);

  const streams = workout.tipo === 'endurance' ? await loadStreams(sql, workout) : null;

  // Forza: video di esecuzione e dubbi dell'atleta + stato del report inviato al coach
  const isStrength = workout.tipo !== 'endurance' && exercises.length > 0;
  const executions = isStrength ? await executionsFor(c, sql, id) : {};
  const report = isStrength ? await reportFor(sql, id) : null;

  return c.json({
    ...workout,
    sport: withLoad?.sport || workout.sport || endurance?.sport || null,
    // il dettaglio carico serve solo per l'endurance
    load: workout.tipo === 'endurance' ? (withLoad?.load || null) : null,
    esercizi: exercises.map((exercise) => ({
      ...exercise,
      esecuzione_dubbi: executions[exercise.exercise_id]?.dubbi || null,
      esecuzione_video_url: executions[exercise.exercise_id]?.video_url || null,
    })),
    report,
    streams,
    feedback: feedback[0] || null,
    endurance,
    scheda,
  });
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
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);

  const workoutDescription = tipo === 'test' && testResult
    ? `${descrizione || ''}\nRisultato: ${testResult}${testUnit ? ` ${testUnit}` : ''}`.trim()
    : descrizione;

  const inserted = await sql`
    INSERT INTO calendar_workouts
      (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, durata_secondi, rpe_pianificato, colore, stato)
    VALUES
      (${utenteId}, ${user.userId}, ${data}, ${tipo || 'forza'}, ${titolo}, ${workoutDescription || null},
      ${durataMinuti || null}, ${durataMinuti ? Number(durataMinuti) * 60 : null}, ${rpePianificato || null}, ${colore || null}, 'pianificato')
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
           ${ex.recupero || null}, ${ex.note || null}, ${ex.videoUrl || ex.video_url || null}, ${i})
      `;
    }
  }

  await notifyNewWorkout(sql, workout, user.userId);
  return c.json(workout);
});

// PUT /calendar/:id - coach edits a workout
app.put('/:id', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const owned = await loadOwnedWorkout(sql, c.get('user'), id);
  if (owned.error) return c.json({ message: owned.error }, owned.status);
  const body = await c.req.json();
  const { data, tipo, titolo, descrizione, durataMinuti, rpePianificato, colore, stato, testResult, testUnit } = body;

  const updated = await sql`
    UPDATE calendar_workouts SET
      data = COALESCE(${data || null}, data),
      tipo = COALESCE(${tipo || null}, tipo),
      titolo = COALESCE(${titolo || null}, titolo),
      descrizione = COALESCE(${tipo === 'test' && testResult ? `${descrizione || ''}\nRisultato: ${testResult}${testUnit ? ` ${testUnit}` : ''}` : descrizione ?? null}, descrizione),
      durata_minuti = COALESCE(${durataMinuti ?? null}, durata_minuti),
      durata_secondi = CASE WHEN ${durataMinuti ?? null}::int IS NULL THEN durata_secondi ELSE ${durataMinuti ?? null}::int * 60 END,
      rpe_pianificato = COALESCE(${rpePianificato ?? null}, rpe_pianificato),
      colore = COALESCE(${colore ?? null}, colore),
      stato = COALESCE(${stato || null}, stato),
      updated_at = NOW()
    WHERE workout_id = ${id}
    RETURNING *
  `;
  if (!updated[0]) return c.json({ message: 'Workout non trovato' }, 404);
  // Spostamento di un allenamento endurance: mantiene allineata la data della sessione
  if (data && updated[0].endurance_session_id) {
    await sql`UPDATE endurance_sessions SET "date" = ${data}, updated_at = NOW() WHERE session_id = ${updated[0].endurance_session_id}`;
  }
  return c.json(updated[0]);
});

// DELETE /calendar/:id
app.delete('/:id', async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  // L'atleta puo' eliminare solo le proprie attivita' importate da file (per poterle ricaricare)
  if (user.ruolo === 'cliente') {
    const rows = await sql`SELECT workout_id FROM calendar_workouts WHERE workout_id = ${id} AND utenteid = ${user.userId} AND external_provider = 'file'`;
    if (!rows.length) return c.json({ message: 'Puoi eliminare solo le attività che hai importato da file' }, 403);
    await sql`DELETE FROM calendar_workouts WHERE workout_id = ${id}`;
    return c.json({ message: 'Eliminato' });
  }
  if (user.ruolo !== 'personal_trainer') return c.json({ message: 'Accesso negato' }, 403);
  const owned = await loadOwnedWorkout(sql, user, id);
  if (owned.error) return c.json({ message: owned.error }, owned.status);
  await sql`DELETE FROM calendar_workouts WHERE workout_id = ${id}`;
  // Senza questa pulizia la sync del calendario ricreerebbe il workout dalla sessione endurance
  if (owned.workout.endurance_session_id) {
    await sql`DELETE FROM endurance_sessions WHERE session_id = ${owned.workout.endurance_session_id}`;
  }
  return c.json({ message: 'Eliminato' });
});

// Replace the exercise list of a workout (coach)
app.put('/:id/exercises', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const id = Number(c.req.param('id'));
  const owned = await loadOwnedWorkout(sql, c.get('user'), id);
  if (owned.error) return c.json({ message: owned.error }, owned.status);
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
         ${ex.recupero || null}, ${ex.note || null}, ${ex.videoUrl || ex.video_url || null}, ${i})
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

  const coachId = workout.coach_userid || await coachOf(sql, user.userId);
  await notify(sql, coachId, {
    tipo: 'feedback',
    mittenteId: user.userId,
    titolo: `${await userName(sql, user.userId)} ha ${completato ? 'completato' : 'saltato'} "${workout.titolo}"`,
    messaggio: [rpe ? `RPE ${rpe}` : null, sensazione ? `sensazione ${sensazione}` : null, note ? `"${String(note).slice(0, 140)}"` : null].filter(Boolean).join(' · ') || null,
    link: { screen: 'WorkoutDetail', params: { workoutId: id, athleteId: user.userId } },
  });

  return c.json(upserted[0]);
});

export default app;
