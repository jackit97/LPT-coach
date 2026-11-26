// Garmin Connect Developer Program: OAuth2 PKCE, chiamate alle API e conversione degli allenamenti LPT
// nel formato della Training API V2 (endurance e forza).

export const GARMIN_AUTH_URL = 'https://connect.garmin.com/oauth2Confirm';
export const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
export const GARMIN_API = 'https://apis.garmin.com';
const PROVIDER = 'LPT Coach';

export function garminConfigured(env) {
  return Boolean(env.GARMIN_CLIENT_ID && env.GARMIN_CLIENT_SECRET);
}

export function garminRedirectUri(env, requestUrl) {
  if (env.GARMIN_REDIRECT_URI) return env.GARMIN_REDIRECT_URI;
  return `${new URL(requestUrl).origin}/garmin/callback`;
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomToken(length = 48) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return b64url(bytes).slice(0, length);
}

export async function pkceChallenge(verifier) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

export class GarminError extends Error {
  constructor(message, status = 502, body = null) { super(message); this.status = status; this.body = body; }
}

async function tokenRequest(env, params) {
  const body = new URLSearchParams({ ...params, client_id: env.GARMIN_CLIENT_ID, client_secret: env.GARMIN_CLIENT_SECRET });
  const response = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.GARMIN_CLIENT_ID}:${env.GARMIN_CLIENT_SECRET}`)}`,
    },
    body,
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!response.ok || !data?.access_token) {
    throw new GarminError(`Token Garmin non ottenuto (${response.status})`, response.status === 400 || response.status === 401 ? 401 : 502, text.slice(0, 300));
  }
  return data;
}

export function exchangeCode(env, { code, verifier, redirectUri }) {
  return tokenRequest(env, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
}

export function tokenColumns(data) {
  const now = Date.now();
  // margine di 10 minuti sulla scadenza del token di accesso (24 h)
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    access_expires_at: new Date(now + (Math.max(Number(data.expires_in) || 86400, 1200) - 600) * 1000).toISOString(),
    refresh_expires_at: data.refresh_token_expires_in ? new Date(now + Number(data.refresh_token_expires_in) * 1000).toISOString() : null,
  };
}

// Token di accesso valido per la connessione (rinnovato se scaduto; Garmin ruota anche il refresh token)
export async function accessTokenFor(sql, env, connection) {
  if (connection.access_token && new Date(connection.access_expires_at).getTime() > Date.now()) return connection.access_token;
  if (!connection.refresh_token) throw new GarminError('Collegamento Garmin scaduto: ricollega l\'account dal Profilo', 401);
  let data;
  try {
    data = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: connection.refresh_token });
  } catch (error) {
    if (error.status === 401) {
      await sql`UPDATE garmin_connections SET access_token = NULL, refresh_token = NULL, last_error = 'Collegamento scaduto: ricollega Garmin', updated_at = NOW() WHERE utenteid = ${connection.utenteid}`;
      throw new GarminError('Collegamento Garmin scaduto: ricollega l\'account dal Profilo', 401);
    }
    throw error;
  }
  const cols = tokenColumns(data);
  await sql`
    UPDATE garmin_connections SET access_token = ${cols.access_token}, refresh_token = ${cols.refresh_token || connection.refresh_token},
      access_expires_at = ${cols.access_expires_at}, refresh_expires_at = COALESCE(${cols.refresh_expires_at}, refresh_expires_at), updated_at = NOW()
    WHERE utenteid = ${connection.utenteid}
  `;
  Object.assign(connection, cols, { refresh_token: cols.refresh_token || connection.refresh_token });
  return cols.access_token;
}

export async function garminApi(token, method, path, body) {
  const response = await fetch(path.startsWith('http') ? path : `${GARMIN_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

export function garminFailure(result, what) {
  const reasons = {
    401: 'collegamento Garmin non più valido, ricollega l\'account',
    403: 'operazione non consentita da Garmin',
    412: 'permesso mancante: in Garmin Connect consenti a LPT Coach l\'importazione degli allenamenti',
    429: 'limite di invii Garmin raggiunto, riprova più tardi',
  };
  const detail = typeof result.data === 'string' ? result.data : result.data?.message || result.data?.error || '';
  return `${what}: ${reasons[result.status] || `errore Garmin ${result.status}`}${detail && !reasons[result.status] ? ` (${String(detail).slice(0, 160)})` : ''}`;
}

// ---------- conversione allenamenti ----------

function parsePaceToSeconds(value) {
  const match = String(value || '').match(/(\d+):([0-5]\d)/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const numeric = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function parseStepSeconds(step) {
  const isTimeUnit = step.unit === 'hh:mm:ss' || step.unit === 'mm:ss';
  const value = String((isTimeUnit ? step.value : step.duration) ?? step.value ?? '').trim();
  if (!value) return 0;
  if (value.split(':').length === 3) { const [h, m, sec] = value.split(':').map(Number); return (h * 3600) + (m * 60) + sec; }
  if (value.includes(':')) { const [minutes, seconds] = value.split(':').map(Number); return (minutes * 60) + seconds; }
  const numeric = Number(value.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric * 60 : 0;
}

const GARMIN_SPORT = { corsa: 'RUNNING', ciclismo: 'CYCLING', nuoto: 'LAP_SWIMMING' };

// Target dello step: passo (corsa/nuoto) o potenza (bici) dalle zone dell'atleta, altrimenti frequenza cardiaca
function stepTarget(sport, zones, zoneKey) {
  if (!zoneKey || sport === 'nuoto') return null;
  if (sport === 'ciclismo') {
    const zone = (zones.power || []).find((item) => item.key === zoneKey);
    const low = Number(zone?.min);
    const high = Number(zone?.max);
    if (low > 0 && high > 0) return { targetType: 'POWER', targetValueLow: Math.round(Math.min(low, high)), targetValueHigh: Math.round(Math.max(low, high)) };
  } else {
    const zone = (zones.pace || []).find((item) => item.key === zoneKey);
    const a = zone ? parsePaceToSeconds(zone.min) : null;
    const b = zone ? parsePaceToSeconds(zone.max) : null;
    if (a && b) {
      return {
        targetType: 'PACE',
        targetValueLow: Number((1000 / Math.max(a, b)).toFixed(3)),
        targetValueHigh: Number((1000 / Math.min(a, b)).toFixed(3)),
      };
    }
  }
  const hr = (zones.heartRate || []).find((item) => item.key === zoneKey);
  const low = Number(hr?.min);
  const high = Number(hr?.max);
  if (low > 0 && high > 0) return { targetType: 'HEART_RATE', targetValueLow: Math.round(Math.min(low, high)), targetValueHigh: Math.round(Math.max(low, high)) };
  return null;
}

const emptyStep = {
  repeatType: null, repeatValue: null, durationValueType: null, targetType: null, targetValue: null,
  targetValueLow: null, targetValueHigh: null, targetValueType: null, strokeType: null, drillType: null,
  equipmentType: null, exerciseCategory: null, exerciseName: null, weightValue: null, weightDisplayUnit: null,
};

function cleanText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function enduranceStep(step, { sport, zones, inRepeat, order }) {
  const value = Number(String(step.value ?? step.meters ?? '').replace(',', '.')) || 0;
  const isDistance = step.unit === 'm' || step.unit === 'mt' || step.unit === 'km';
  const meters = isDistance ? (step.unit === 'km' ? value * 1000 : value) : 0;
  const seconds = isDistance ? 0 : parseStepSeconds(step);
  const recovery = step.type === 'Recupero';
  const intensity = step.type === 'Riscaldamento' ? 'WARMUP'
    : step.type === 'Defaticamento' ? 'COOLDOWN'
      : recovery ? (inRepeat ? 'RECOVERY' : 'REST')
        : inRepeat ? 'INTERVAL' : 'ACTIVE';
  const target = recovery ? null : stepTarget(sport, zones, step.zone);
  let duration;
  if (meters > 0) duration = { durationType: 'DISTANCE', durationValue: Math.round(meters), durationValueType: 'METER' };
  else if (seconds > 0) duration = { durationType: sport === 'nuoto' && recovery ? 'FIXED_REST' : 'TIME', durationValue: Math.round(seconds) };
  else duration = { durationType: 'OPEN', durationValue: null };
  const description = cleanText([step.type, step.zone, step.notes].filter(Boolean).join(' · '), 512);
  return {
    ...emptyStep,
    type: 'WorkoutStep',
    stepOrder: order,
    intensity,
    description,
    ...duration,
    ...(target || { targetType: sport === 'nuoto' ? null : 'OPEN' }),
    ...(sport === 'nuoto' && !recovery ? { strokeType: 'FREESTYLE' } : {}),
  };
}

/** Allenamento endurance (steps_json dell'editor) -> workout Training API */
export function buildEnduranceWorkout(workout, steps, zones = {}, sport = 'corsa') {
  const garminSport = GARMIN_SPORT[sport] || 'RUNNING';
  let order = 0;
  const out = [];
  for (const step of steps || []) {
    const children = (step.children || []).length ? step.children : [step];
    const times = Math.max(1, Math.round(Number(step.repeats) || 1));
    if (times > 1) {
      const repeat = { ...emptyStep, type: 'WorkoutRepeatStep', stepOrder: (order += 1), repeatType: 'REPEAT_UNTIL_STEPS_CMPLT', repeatValue: times, intensity: 'INTERVAL', skipLastRestStep: garminSport === 'LAP_SWIMMING', steps: [] };
      for (const child of children) repeat.steps.push(enduranceStep(child, { sport, zones, inRepeat: true, order: (order += 1) }));
      out.push(repeat);
    } else {
      for (const child of children) out.push(enduranceStep(child, { sport, zones, inRepeat: false, order: (order += 1) }));
    }
  }
  if (!out.length) {
    // sessione senza step: un unico blocco con la durata prevista
    const seconds = Number(workout.durata_secondi) || (Number(workout.durata_minuti) || 0) * 60;
    out.push({
      ...emptyStep, type: 'WorkoutStep', stepOrder: 1, intensity: 'ACTIVE', description: cleanText(workout.titolo, 512),
      ...(seconds > 0 ? { durationType: 'TIME', durationValue: seconds } : { durationType: 'OPEN', durationValue: null }),
      targetType: garminSport === 'LAP_SWIMMING' ? null : 'OPEN',
      ...(garminSport === 'LAP_SWIMMING' ? { strokeType: 'FREESTYLE' } : {}),
    });
  }
  return wrapWorkout(workout, garminSport, out);
}

function wrapWorkout(workout, sport, steps) {
  const swim = sport === 'LAP_SWIMMING';
  return {
    workoutName: String(workout.titolo || 'Allenamento LPT').slice(0, 100),
    description: cleanText(workout.descrizione, 1024),
    sport,
    poolLength: swim ? 25 : null,
    poolLengthUnit: swim ? 'METER' : null,
    workoutProvider: PROVIDER,
    workoutSourceId: PROVIDER,
    isSessionTransitionEnabled: false,
    segments: [{ segmentOrder: 1, sport, poolLength: swim ? 25 : null, poolLengthUnit: swim ? 'METER' : null, steps }],
  };
}

// ---------- forza ----------

// Nome esercizio (italiano o inglese) -> categoria/nome della Appendix B della Training API.
// L'ordine conta: i casi piu' specifici prima.
const EXERCISE_MAP = [
  [/stacco\s*rumeno|romanian|\brdl\b/, 'DEADLIFT', 'ROMANIAN_DEADLIFT'],
  [/stacco\s*sumo|sumo\s*dead/, 'DEADLIFT', 'SUMO_DEADLIFT'],
  [/stacco.*(manubri|dumbbell)|dumbbell\s*dead/, 'DEADLIFT', 'DUMBBELL_DEADLIFT'],
  [/stacc|deadlift/, 'DEADLIFT', 'BARBELL_DEADLIFT'],
  [/good\s*morning/, 'LEG_CURL', 'GOOD_MORNING'],
  [/leg\s*curl|femoral/, 'LEG_CURL', 'LEG_CURL'],
  [/leg\s*press|pressa/, 'SQUAT', 'LEG_PRESS'],
  [/front\s*squat/, 'SQUAT', 'BARBELL_FRONT_SQUAT'],
  [/goblet/, 'SQUAT', 'GOBLET_SQUAT'],
  [/bulgar|split\s*squat/, 'LUNGE', 'DUMBBELL_BULGARIAN_SPLIT_SQUAT'],
  [/squat.*(manubri|dumbbell)/, 'SQUAT', 'DUMBBELL_SQUAT'],
  [/jump\s*squat|squat\s*jump|squat\s*salt/, 'PLYO', 'JUMP_SQUAT'],
  [/squat/, 'SQUAT', 'BARBELL_BACK_SQUAT'],
  [/affond|lunge/, 'LUNGE', 'DUMBBELL_LUNGE'],
  [/step\s*up/, 'SQUAT', 'DUMBBELL_STEP_UP'],
  [/hip\s*thrust/, 'HIP_RAISE', 'BARBELL_HIP_THRUST_WITH_BENCH'],
  [/ponte|glute\s*bridge|hip\s*raise/, 'HIP_RAISE', 'HIP_RAISE'],
  [/panca\s*inclinata.*manubri|incline.*dumbbell/, 'BENCH_PRESS', 'INCLINE_DUMBBELL_BENCH_PRESS'],
  [/panca\s*inclinata|incline.*bench/, 'BENCH_PRESS', 'INCLINE_BARBELL_BENCH_PRESS'],
  [/panca.*manubri|dumbbell\s*bench|chest\s*press.*manubri/, 'BENCH_PRESS', 'DUMBBELL_BENCH_PRESS'],
  [/panca\s*strett|close\s*grip/, 'BENCH_PRESS', 'CLOSE_GRIP_BARBELL_BENCH_PRESS'],
  [/panca|bench\s*press|distensioni/, 'BENCH_PRESS', 'BARBELL_BENCH_PRESS'],
  [/croci|fly|flye|pectoral|peck\s*deck/, 'FLYE', 'DUMBBELL_FLYE'],
  [/piegament|push\s*-?\s*up|flession/, 'PUSH_UP', 'PUSH_UP'],
  [/dip/, 'TRICEPS_EXTENSION', 'BODY_WEIGHT_DIP'],
  [/lat\s*machine|lat\s*pull|pulldown|pull\s*down/, 'PULL_UP', 'LAT_PULLDOWN'],
  [/trazion|pull\s*-?\s*up|chin\s*-?\s*up/, 'PULL_UP', 'PULL_UP'],
  [/rematore.*manubri|dumbbell\s*row|one\s*arm\s*row/, 'ROW', 'ONE_ARM_BENT_OVER_ROW'],
  [/pulley|seated\s*(cable\s*)?row|cable\s*row/, 'ROW', 'SEATED_CABLE_ROW'],
  [/face\s*pull/, 'ROW', 'FACE_PULL'],
  [/rematore|\brow\b|rowing/, 'ROW', 'BARBELL_ROW'],
  [/alzate\s*lateral|lateral\s*raise/, 'LATERAL_RAISE', 'DUMBBELL_LATERAL_RAISE'],
  [/alzate\s*frontal|front\s*raise/, 'LATERAL_RAISE', 'FRONT_RAISE'],
  [/arnold/, 'SHOULDER_PRESS', 'ARNOLD_PRESS'],
  [/lento|military|overhead\s*press|shoulder\s*press|spinte.*manubri/, 'SHOULDER_PRESS', 'BARBELL_SHOULDER_PRESS'],
  [/scrollat|shrug/, 'SHRUG', 'BARBELL_SHRUG'],
  [/hammer|martello/, 'CURL', 'DUMBBELL_HAMMER_CURL'],
  [/curl.*manubri|dumbbell\s*curl/, 'CURL', 'STANDING_DUMBBELL_BICEPS_CURL'],
  [/curl|bicipit/, 'CURL', 'BARBELL_BICEPS_CURL'],
  [/french\s*press|skull/, 'TRICEPS_EXTENSION', 'LYING_EZ_BAR_TRICEPS_EXTENSION'],
  [/push\s*down|pushdown|tricipit|triceps/, 'TRICEPS_EXTENSION', 'TRICEPS_PRESSDOWN'],
  [/polpacc|calf/, 'CALF_RAISE', 'STANDING_CALF_RAISE'],
  [/side\s*plank|plank\s*lateral/, 'PLANK', 'SIDE_PLANK'],
  [/plank/, 'PLANK', 'PLANK'],
  [/russian\s*twist/, 'CORE', 'RUSSIAN_TWIST'],
  [/leg\s*raise|alzate\s*gamb|sollevamento\s*gamb/, 'LEG_RAISE', 'HANGING_LEG_RAISE'],
  [/crunch|addominal/, 'CRUNCH', 'CRUNCH'],
  [/sit\s*-?\s*up/, 'SIT_UP', 'SIT_UP'],
  [/hyperext|iperestension|back\s*ext/, 'HYPEREXTENSION', 'BACK_EXTENSION_WITH_OPPOSITE_ARM_AND_LEG_REACH'],
  [/farmer|carry|camminata\s*del\s*contadino/, 'CARRY', 'FARMERS_WALK'],
  [/kettlebell\s*swing|swing/, 'HIP_SWING', 'SINGLE_ARM_KETTLEBELL_SWING'],
  [/box\s*jump|salti\s*sul\s*box/, 'PLYO', 'BOX_JUMP'],
  [/burpee/, 'TOTAL_BODY', 'BURPEE'],
  [/clean|girata|snatch|strappo/, 'OLYMPIC_LIFT', 'BARBELL_POWER_CLEAN'],
  [/thruster/, 'SQUAT', 'THRUSTERS'],
  [/mountain\s*climber/, 'PLANK', 'MOUNTAIN_CLIMBER'],
  [/jumping\s*jack/, 'CARDIO', 'JUMPING_JACKS'],
];

let validNames = null;
export function setExerciseCatalog(catalog) { validNames = catalog; }

export function matchExercise(name) {
  const text = String(name || '').toLowerCase();
  for (const [pattern, category, exercise] of EXERCISE_MAP) {
    if (!category || !pattern.test(text)) continue;
    if (validNames && !(validNames[category] || []).includes(exercise)) return { exerciseCategory: category, exerciseName: null };
    return { exerciseCategory: category, exerciseName: exercise };
  }
  return { exerciseCategory: null, exerciseName: null };
}

function firstNumber(value) {
  const match = String(value ?? '').replace(',', '.').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

// "45s", "45''", "1:00", "1 min" -> secondi; null se e' un numero di ripetizioni
function repsAsSeconds(value) {
  const text = String(value ?? '').toLowerCase();
  const clock = text.match(/(\d+):([0-5]\d)/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const minutes = text.match(/(\d+(?:[.,]\d+)?)\s*(min|m\b|')(?!')/);
  if (minutes && !/''/.test(text)) return Math.round(Number(minutes[1].replace(',', '.')) * 60);
  const seconds = text.match(/(\d+)\s*(s\b|sec|secondi|''|")/);
  return seconds ? Number(seconds[1]) : null;
}

export function restSeconds(value) {
  const text = String(value ?? '').toLowerCase().trim();
  if (!text) return null;
  const clock = text.match(/(\d+):([0-5]\d)/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const minSec = text.match(/(\d+)\s*'\s*(\d+)/);
  if (minSec) return Number(minSec[1]) * 60 + Number(minSec[2]);
  const seconds = text.match(/(\d+)\s*(s\b|sec|secondi|''|")/);
  if (seconds) return Number(seconds[1]);
  const minutes = text.match(/(\d+(?:[.,]\d+)?)\s*(min|m\b|'|minuti)/);
  if (minutes) return Math.round(Number(minutes[1].replace(',', '.')) * 60);
  const plain = firstNumber(text);
  if (!plain) return null;
  return plain <= 5 ? Math.round(plain * 60) : Math.round(plain); // "2" = 2 minuti, "90" = 90 secondi
}

function weightKg(value) {
  const text = String(value ?? '').toLowerCase();
  if (!text || /%|rpe|rir|corpo\s*libero|bodyweight/.test(text)) return null;
  const kg = firstNumber(text);
  if (!kg || kg <= 0 || kg > 500) return null;
  return /lb|lbs|libbre/.test(text) ? Number((kg * 0.4536).toFixed(1)) : kg;
}

/** Allenamento di forza/funzionale (esercizi del calendario) -> workout STRENGTH_TRAINING */
export function buildStrengthWorkout(workout, exercises) {
  let order = 0;
  const out = [];
  for (const ex of exercises || []) {
    if (!ex?.nome) continue;
    if (order >= 95) break; // limite Garmin: 100 step per allenamento
    const sets = Math.min(Math.max(Math.round(Number(ex.serie) || 1), 1), 20);
    const timed = repsAsSeconds(ex.ripetizioni);
    const reps = timed ? null : firstNumber(ex.ripetizioni);
    const kg = weightKg(ex.carico);
    const rest = restSeconds(ex.recupero);
    const description = cleanText([ex.nome, ex.ripetizioni && `${sets > 1 ? `${sets}x` : ''}${ex.ripetizioni}`, ex.carico, ex.note].filter(Boolean).join(' · '), 512);
    const work = (stepOrder) => ({
      ...emptyStep,
      type: 'WorkoutStep',
      stepOrder,
      intensity: 'ACTIVE',
      description,
      ...(timed ? { durationType: 'TIME', durationValue: timed }
        : reps ? { durationType: 'REPS', durationValue: Math.round(reps) }
          : { durationType: 'OPEN', durationValue: null }),
      targetType: 'OPEN',
      ...matchExercise(ex.nome),
      ...(kg ? { weightValue: kg, weightDisplayUnit: 'KILOGRAM' } : {}),
    });
    const restStep = (stepOrder) => ({
      ...emptyStep,
      type: 'WorkoutStep',
      stepOrder,
      intensity: 'REST',
      description: 'Recupero',
      ...(rest ? { durationType: 'TIME', durationValue: rest } : { durationType: 'OPEN', durationValue: null }),
      targetType: 'OPEN',
    });
    if (sets > 1) {
      const repeat = { ...emptyStep, type: 'WorkoutRepeatStep', stepOrder: (order += 1), repeatType: 'REPEAT_UNTIL_STEPS_CMPLT', repeatValue: sets, intensity: 'ACTIVE', skipLastRestStep: true, steps: [] };
      repeat.steps.push(work((order += 1)));
      repeat.steps.push(restStep((order += 1)));
      out.push(repeat);
    } else {
      out.push(work((order += 1)));
      if (rest) out.push(restStep((order += 1)));
    }
  }
  if (!out.length) {
    out.push({ ...emptyStep, type: 'WorkoutStep', stepOrder: 1, intensity: 'ACTIVE', description: cleanText(workout.titolo, 512), durationType: 'OPEN', durationValue: null, targetType: 'OPEN' });
  }
  return wrapWorkout(workout, 'STRENGTH_TRAINING', out);
}

/** Workout Garmin per un allenamento del calendario, o null se non si puo' inviare (riposo, attivita' importate...) */
export function buildGarminWorkout(workout, { steps = [], sport = null, zones = {}, exercises = [] } = {}) {
  if (workout.external_provider || workout.stato === 'completato' || workout.tipo === 'riposo') return null;
  if (workout.tipo === 'endurance') return buildEnduranceWorkout(workout, steps, zones, sport || workout.sport || 'corsa');
  if (workout.tipo === 'test' && (sport || workout.sport)) return buildEnduranceWorkout(workout, steps, zones, sport || workout.sport);
  if (workout.tipo === 'mobilita') {
    const built = buildStrengthWorkout(workout, exercises);
    return { ...built, sport: 'YOGA', segments: built.segments.map((segment) => ({ ...segment, sport: 'YOGA', steps: stripStrength(segment.steps) })) };
  }
  return buildStrengthWorkout(workout, exercises);
}

function stripStrength(steps) {
  return steps.map((step) => ({
    ...step, exerciseCategory: null, exerciseName: null, weightValue: null, weightDisplayUnit: null,
    ...(step.durationType === 'REPS' ? { durationType: 'OPEN', durationValue: null } : {}),
    ...(step.steps ? { steps: stripStrength(step.steps) } : {}),
  }));
}

export async function payloadHash(payload, date) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${date}|${JSON.stringify(payload)}`));
  return [...new Uint8Array(bytes)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- attivita' ricevute da Garmin (riepilogo senza file) ----------
export function activityFromSummary(summary, sportKey) {
  const raw = String(summary.activityType || '');
  const key = sportKey(raw);
  const strength = !key && /training|strength|weight|crossfit|hiit|fitness_equipment|cardio/i.test(raw);
  const label = key ? { corsa: 'Corsa', ciclismo: 'Bici', nuoto: 'Nuoto' }[key] : strength ? 'Allenamento' : 'Attività';
  const meters = Number(summary.distanceInMeters) || 0;
  return {
    format: 'garmin',
    rawSport: raw,
    name: summary.activityName || null,
    // descrizione/note dell'attivita' su Garmin Connect, se Garmin la invia
    notes: summary.description || summary.activityDescription || summary.notes || null,
    start: new Date(Number(summary.startTimeInSeconds) * 1000),
    localOffsetSeconds: Number.isFinite(Number(summary.startTimeOffsetInSeconds)) ? Number(summary.startTimeOffsetInSeconds) : undefined,
    durationSeconds: Math.round(Number(summary.durationInSeconds) || 0),
    distanceMeters: meters,
    distanceKm: meters ? Number((meters / 1000).toFixed(2)) : 0,
    avgHr: summary.averageHeartRateInBeatsPerMinute ? Math.round(summary.averageHeartRateInBeatsPerMinute) : null,
    elevGainM: summary.totalElevationGainInMeters ? Math.round(summary.totalElevationGainInMeters) : null,
    calories: summary.activeKilocalories ? Math.round(summary.activeKilocalories) : null,
    sport: key,
    tipo: strength ? 'forza' : 'endurance',
    title: summary.activityName ? String(summary.activityName).slice(0, 255) : (strength ? `${label} importato` : `${label} importata`),
  };
}
