// Modello di carico in stile CoachPeaking.
// - TRIMP: minuti trascorsi in ogni zona (Z1..Z7) moltiplicati per un coefficiente crescente.
// - Carico acuto (fatica): media esponenziale del TRIMP giornaliero su 7 giorni.
// - Carico cronico (forma): media esponenziale del TRIMP giornaliero su 42 giorni.
// - Performance = cronico - acuto.
// NB: la stessa logica e' replicata in app/utils/trainingLoad.js per i calcoli live nell'editor.

export const ZONE_TRIMP_WEIGHTS = { Z0: 0, Z1: 1, Z2: 1.5, Z3: 2.2, Z4: 3.2, Z5: 4.5, Z6: 6, Z7: 8 };
export const ACUTE_DAYS = 7;
// Forza/funzionale: solo parte della seduta e' lavoro effettivo, quindi il TRIMP da RPE viene ridotto.
export const NON_ENDURANCE_FACTOR = 0.6;
export const CHRONIC_DAYS = 42;

// Sport endurance riconosciuti e relativa icona/colore (allineati all'editor).
export const SPORTS = ['corsa', 'ciclismo', 'nuoto'];

// RPE (1-10) -> zona equivalente, usata quando non ci sono dati di zona/FC.
export function rpeToZone(rpe) {
  const value = Number(rpe);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= 2) return 'Z1';
  if (value <= 4) return 'Z2';
  if (value <= 5) return 'Z3';
  if (value <= 7) return 'Z4';
  if (value <= 8) return 'Z5';
  if (value <= 9) return 'Z6';
  return 'Z7';
}

export function trimpFromZoneSeconds(zoneSeconds = {}) {
  return Math.round(Object.entries(zoneSeconds).reduce(
    (sum, [zone, seconds]) => sum + ((Number(seconds) || 0) / 60) * (ZONE_TRIMP_WEIGHTS[zone] ?? 1),
    0,
  ));
}

export function parseClock(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (text.includes(':')) {
    const parts = text.split(':').map(Number);
    if (!parts.every(Number.isFinite)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const numeric = Number(text.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric * 60 : 0;
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// Analizza gli step salvati dall'editor endurance (steps_json) e restituisce
// secondi/metri totali, tempo per zona e profilo sequenziale per i mini-grafici.
export function analyzeSteps(stepsJson) {
  const blocks = safeJson(stepsJson, []);
  const zoneSeconds = {};
  const profile = [];
  let seconds = 0;
  let meters = 0;
  if (!Array.isArray(blocks)) return { seconds, meters, zoneSeconds, profile, trimp: 0 };
  for (const block of blocks) {
    const repeats = Math.max(1, Number(block?.repeats) || 1);
    const children = Array.isArray(block?.children) && block.children.length ? block.children : [block];
    for (let r = 0; r < repeats; r += 1) {
      for (const child of children) {
        const childSeconds = parseClock(child?.duration);
        const childMeters = Number(child?.meters) || 0;
        const zone = String(child?.zone || block?.zone || 'Z2').toUpperCase();
        seconds += childSeconds;
        meters += childMeters;
        zoneSeconds[zone] = (zoneSeconds[zone] || 0) + childSeconds;
        if (profile.length < 80) profile.push({ zone, seconds: Math.round(childSeconds) });
      }
    }
  }
  return { seconds, meters, zoneSeconds, profile, trimp: trimpFromZoneSeconds(zoneSeconds) };
}

// Trova la zona FC in cui cade una frequenza media.
export function hrToZone(avgHr, hrZones = []) {
  const hr = Number(avgHr);
  if (!Number.isFinite(hr) || hr <= 0 || !Array.isArray(hrZones) || !hrZones.length) return null;
  const valid = hrZones
    .map((zone) => ({ key: zone.key, min: Number(zone.min), max: Number(zone.max) }))
    .filter((zone) => Number.isFinite(zone.min) && Number.isFinite(zone.max) && zone.max > 0);
  if (!valid.length) return null;
  const hit = valid.find((zone) => hr >= zone.min && hr < zone.max);
  if (hit) return hit.key;
  return hr < valid[0].min ? valid[0].key : valid[valid.length - 1].key;
}

export function workoutPlannedSeconds(workout, analysis) {
  if (analysis?.seconds) return analysis.seconds;
  return Number(workout.durata_secondi ?? (Number(workout.durata_minuti) || 0) * 60) || 0;
}

const NON_TRAINING = new Set(['dieta', 'scadenza_dieta', 'scheda', 'scadenza_scheda', 'pagamento', 'riposo']);

// Arricchisce una riga calendar_workouts (+ eventuale sessione/feedback) con i valori di carico.
// Restituisce i campi calcolati: sport, trimp/tempo/km pianificati ed eseguiti, profilo zone.
export function computeWorkoutLoad(workout, { session = null, hrZones = [] } = {}) {
  if (NON_TRAINING.has(workout.tipo)) return null;
  const analysis = session?.steps_json ? analyzeSteps(session.steps_json) : null;
  const isExternal = !!workout.external_provider;
  const plannedSeconds = isExternal ? 0 : workoutPlannedSeconds(workout, analysis);
  const plannedMeters = isExternal ? 0 : Math.round(analysis?.meters || 0);
  let plannedTrimp = 0;
  if (!isExternal) {
    if (analysis?.trimp) plannedTrimp = analysis.trimp;
    else {
      const zone = rpeToZone(workout.rpe_pianificato) || (workout.tipo === 'endurance' ? 'Z2' : 'Z3');
      plannedTrimp = trimpFromZoneSeconds({ [zone]: plannedSeconds });
    }
  }

  const completed = workout.stato === 'completato' || Number(workout.completato) === 1;
  let doneSeconds = 0;
  let doneMeters = 0;
  let doneTrimp = 0;
  let trimpMethod = null;
  if (completed) {
    const feedbackMinutes = Number(workout.durata_effettiva_minuti) || 0;
    doneSeconds = isExternal
      ? Number(workout.durata_secondi ?? (Number(workout.durata_minuti) || 0) * 60) || 0
      : (feedbackMinutes ? feedbackMinutes * 60 : plannedSeconds);
    doneMeters = workout.distance_km ? Math.round(Number(workout.distance_km) * 1000) : (isExternal ? 0 : plannedMeters);
    const hrZone = hrToZone(workout.avg_hr, hrZones);
    const rpeZone = rpeToZone(workout.feedback_rpe ?? workout.rpe);
    if (hrZone) {
      doneTrimp = trimpFromZoneSeconds({ [hrZone]: doneSeconds });
      trimpMethod = 'fc';
    } else if (!isExternal && plannedTrimp && plannedSeconds && (!rpeZone || analysis?.trimp)) {
      // allenamento strutturato: scala il TRIMP pianificato sulla durata reale
      doneTrimp = Math.round(plannedTrimp * (doneSeconds / plannedSeconds));
      trimpMethod = 'pianificato';
    } else if (rpeZone) {
      doneTrimp = trimpFromZoneSeconds({ [rpeZone]: doneSeconds });
      trimpMethod = 'rpe';
    } else {
      doneTrimp = trimpFromZoneSeconds({ [workout.tipo === 'endurance' ? 'Z2' : 'Z3']: doneSeconds });
      trimpMethod = 'stima';
    }
  }

  if (workout.tipo !== 'endurance') {
    plannedTrimp = Math.round(plannedTrimp * NON_ENDURANCE_FACTOR);
    if (trimpMethod !== 'fc') doneTrimp = Math.round(doneTrimp * NON_ENDURANCE_FACTOR);
  }

  return {
    sport: workout.sport || session?.sport || null,
    trimp_pianificato: plannedTrimp,
    secondi_pianificati: Math.round(plannedSeconds),
    metri_pianificati: plannedMeters,
    trimp_eseguito: doneTrimp,
    secondi_eseguiti: Math.round(doneSeconds),
    metri_eseguiti: doneMeters,
    trimp_metodo: trimpMethod,
    zone_profile: analysis?.profile || [],
    zone_seconds: analysis?.zoneSeconds || {},
  };
}

function isoDay(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

function addDaysIso(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Serie giornaliera di carico acuto/cronico/performance a partire dai workout arricchiti.
// I valori fino a "oggi" usano il TRIMP eseguito; dopo oggi quello pianificato (proiezione).
export function buildLoadSeries(workouts, { from, to, today }) {
  const daily = new Map();
  for (const workout of workouts) {
    if (!workout.load) continue;
    const day = isoDay(workout.data);
    const entry = daily.get(day) || { done: 0, planned: 0 };
    entry.done += workout.load.trimp_eseguito || 0;
    entry.planned += workout.load.trimp_pianificato || 0;
    daily.set(day, entry);
  }
  const acuteK = 1 - Math.exp(-1 / ACUTE_DAYS);
  const chronicK = 1 - Math.exp(-1 / CHRONIC_DAYS);
  const firstDay = daily.size ? [...daily.keys()].sort()[0] : from;
  let cursor = firstDay < from ? firstDay : addDaysIso(from, -CHRONIC_DAYS * 2);
  let acute = 0;
  let chronic = 0;
  const series = [];
  while (cursor <= to) {
    const entry = daily.get(cursor) || { done: 0, planned: 0 };
    const isFuture = cursor > today;
    const value = isFuture ? entry.planned : entry.done;
    acute += (value - acute) * acuteK;
    chronic += (value - chronic) * chronicK;
    if (cursor >= from) {
      series.push({
        data: cursor,
        trimp_eseguito: Math.round(entry.done),
        trimp_pianificato: Math.round(entry.planned),
        acuto: Number(acute.toFixed(1)),
        cronico: Number(chronic.toFixed(1)),
        performance: Number((chronic - acute).toFixed(1)),
        proiezione: isFuture,
      });
    }
    cursor = addDaysIso(cursor, 1);
  }
  return series;
}

export function weeklySummary(workouts) {
  const weeks = new Map();
  for (const workout of workouts) {
    if (!workout.load) continue;
    const date = new Date(`${isoDay(workout.data)}T12:00:00Z`);
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const week = weeks.get(key) || { settimana: key, secondi_pianificati: 0, secondi_eseguiti: 0, metri_pianificati: 0, metri_eseguiti: 0, trimp_pianificato: 0, trimp_eseguito: 0, sessioni_pianificate: 0, sessioni_eseguite: 0 };
    week.secondi_pianificati += workout.load.secondi_pianificati;
    week.secondi_eseguiti += workout.load.secondi_eseguiti;
    week.metri_pianificati += workout.load.metri_pianificati;
    week.metri_eseguiti += workout.load.metri_eseguiti;
    week.trimp_pianificato += workout.load.trimp_pianificato;
    week.trimp_eseguito += workout.load.trimp_eseguito;
    if (!workout.external_provider) week.sessioni_pianificate += 1;
    if (workout.load.secondi_eseguiti > 0) week.sessioni_eseguite += 1;
    weeks.set(key, week);
  }
  return [...weeks.values()].sort((a, b) => a.settimana.localeCompare(b.settimana));
}

export function todayIso() {
  // Il calendario e' in ora italiana: usa Europe/Rome per stabilire "oggi".
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export { addDaysIso, isoDay, safeJson };
