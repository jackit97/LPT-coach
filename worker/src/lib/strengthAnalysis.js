// Analisi degli allenamenti di forza: serie, ripetizioni, volume (kg sollevati), carico massimo,
// 1RM stimato (Epley) e confronto con le volte precedenti dello stesso esercizio.

// "8-10" -> 9, "10 per lato" -> 10, "12+12" -> 24; tempo ("30s", "1'", "45 sec") o AMRAP -> null
export function parseReps(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/\d\s*(s|sec|secondi|"|'|min|minuti)\b|\d\s*["']|amrap|max/.test(text)) return null;
  const plus = text.match(/^(\d+)\s*\+\s*(\d+)/);
  if (plus) return Number(plus[1]) + Number(plus[2]);
  const nums = (text.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
  if (!nums.length) return null;
  const range = text.match(/(\d+)\s*[-–/]\s*(\d+)/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);
  return Math.round(nums[0]);
}

// "60 kg" -> 60, "60-70" -> 65, "2x16kg" -> 32 (manubri/kettlebell); %, RPE, corpo libero -> null
export function parseKg(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(',', '.');
  if (!text || /%|rpe|rir|corpo libero|bw|elastic|banda/.test(text)) return null;
  const pair = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*kg/);
  if (pair) return Number(pair[1]) * Number(pair[2]);
  const range = text.match(/(\d+(?:\.\d+)?)\s*[-–/]\s*(\d+(?:\.\d+)?)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const num = text.match(/\d+(?:\.\d+)?/);
  if (!num) return null;
  const kg = Number(num[0]);
  return /lb|lbs/.test(text) ? Math.round(kg * 0.4536 * 10) / 10 : kg;
}

const round1 = (value) => Math.round(value * 10) / 10;
// data come 'YYYY-MM-DD' (il driver restituisce Date): serve per ordinare e confrontare
const dayOf = (value) => {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return String(value || '').slice(0, 10);
};

export function safeSets(json) {
  if (!json) return [];
  try {
    const list = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(list) ? list.map((set) => ({
      reps: Number.isFinite(Number(set?.reps)) && set?.reps !== '' && set?.reps !== null ? Number(set.reps) : null,
      kg: Number.isFinite(Number(set?.kg)) && set?.kg !== '' && set?.kg !== null ? Number(set.kg) : null,
      fatta: set?.fatta !== false,
    })) : [];
  } catch {
    return [];
  }
}

// serie pianificate dal coach (serie x ripetizioni @ carico)
export function plannedSets(exercise) {
  const count = Math.max(0, Math.min(30, Number(exercise.serie) || 0));
  const reps = parseReps(exercise.ripetizioni);
  const kg = parseKg(exercise.carico);
  return Array.from({ length: count }, () => ({ reps, kg, fatta: true }));
}

export function setStats(sets) {
  const done = sets.filter((set) => set.fatta !== false);
  let reps = 0;
  let volume = 0;
  let topKg = null;
  let e1rm = null;
  for (const set of done) {
    if (set.reps) reps += set.reps;
    if (set.reps && set.kg) volume += set.reps * set.kg;
    if (set.kg && (topKg === null || set.kg > topKg)) topKg = set.kg;
    // 1RM stimato (Epley) solo per serie fino a 12 ripetizioni, oltre e' poco affidabile
    if (set.kg && set.reps && set.reps <= 12) {
      const estimate = set.reps === 1 ? set.kg : set.kg * (1 + set.reps / 30);
      if (e1rm === null || estimate > e1rm) e1rm = estimate;
    }
  }
  return {
    serie: done.length,
    ripetizioni: reps,
    volume_kg: Math.round(volume),
    top_kg: topKg === null ? null : round1(topKg),
    e1rm: e1rm === null ? null : round1(e1rm),
  };
}

export const nameKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Garmin: categorie degli esercizi registrati dall'orologio
const CATEGORY_LABELS = {
  benchPress: 'Panca piana', calfRaise: 'Calf raise', cardio: 'Cardio', carry: 'Trasporti', chop: 'Chop', core: 'Core', crunch: 'Crunch',
  curl: 'Curl', deadlift: 'Stacco', flye: 'Croci', hipRaise: 'Hip thrust / ponte', hipStability: 'Stabilità anca', hipSwing: 'Swing',
  hyperextension: 'Iperestensioni', lateralRaise: 'Alzate laterali', legCurl: 'Leg curl', legRaise: 'Leg raise', lunge: 'Affondi',
  olympicLift: 'Sollevamento olimpico', plank: 'Plank', plyo: 'Pliometria', pullUp: 'Trazioni', pushUp: 'Piegamenti', row: 'Rematore',
  shoulderPress: 'Lento / shoulder press', shoulderStability: 'Stabilità spalle', shrug: 'Scrollate', sitUp: 'Sit-up', squat: 'Squat',
  totalBody: 'Total body', tricepsExtension: 'Estensioni tricipiti', warmUp: 'Riscaldamento', run: 'Corsa', bike: 'Bici',
  bandedExercises: 'Elastici', battleRope: 'Battle rope', indoorRow: 'Vogatore', sandbag: 'Sandbag', sled: 'Slitta', suspension: 'TRX',
};
export function categoryLabel(category) {
  const key = Array.isArray(category) ? category.find((c) => c && c !== 'unknown') : category;
  if (!key || key === 'unknown' || typeof key === 'number') return 'Esercizio';
  return CATEGORY_LABELS[key] || String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

// Serie registrate dall'orologio (file .fit): raggruppa le serie consecutive dello stesso esercizio
export function exercisesFromFileSets(fileSets = []) {
  const groups = [];
  for (const set of fileSets) {
    const name = set.esercizio || 'Esercizio';
    let group = groups[groups.length - 1];
    if (!group || group.nome !== name) { group = { nome: name, sets: [] }; groups.push(group); }
    group.sets.push({ reps: set.reps ?? null, kg: set.kg ?? null, fatta: true, secondi: set.secondi ?? null });
  }
  return groups;
}

// workout: riga calendar_workouts; exercises: righe calendar_workout_exercises (con serie_eseguite_json)
// history: righe { nome, data, workout_id, serie_eseguite_json, serie, ripetizioni, carico } delle sedute precedenti
export function buildStrengthAnalysis({ workout, exercises = [], history = [], fileSets = [] }) {
  const completed = workout.stato === 'completato';
  let fonte = 'pianificato';
  let rows;
  if (exercises.length) {
    const anyLogged = exercises.some((ex) => safeSets(ex.serie_eseguite_json).length);
    if (anyLogged) fonte = 'eseguito';
    else if (completed) fonte = 'pianificato_completato';
    rows = exercises.map((ex) => {
      const logged = safeSets(ex.serie_eseguite_json);
      const sets = logged.length ? logged : plannedSets(ex);
      return { exercise_id: ex.exercise_id, nome: ex.nome, registrato: logged.length > 0, sets, pianificato: setStats(plannedSets(ex)) };
    });
  } else if (fileSets.length) {
    fonte = 'file';
    rows = exercisesFromFileSets(fileSets).map((group) => ({ exercise_id: null, nome: group.nome, registrato: true, sets: group.sets, pianificato: null }));
  } else {
    return null;
  }

  // storico per esercizio: le ultime sedute prima di questa
  const byName = new Map();
  for (const row of history) {
    const key = nameKey(row.nome);
    const logged = safeSets(row.serie_eseguite_json);
    const sets = logged.length ? logged : plannedSets(row);
    const stats = setStats(sets);
    if (!stats.serie) continue;
    const list = byName.get(key) || [];
    // piu' esercizi con lo stesso nome nella stessa seduta: tiene il migliore
    const same = list.find((item) => item.workout_id === row.workout_id);
    if (same) { if ((stats.top_kg || 0) > (same.top_kg || 0)) Object.assign(same, stats); continue; }
    list.push({ workout_id: row.workout_id, data: dayOf(row.data), registrato: logged.length > 0, ...stats });
    byName.set(key, list);
  }

  const esercizi = rows.map((row) => {
    const stats = setStats(row.sets);
    const storico = (byName.get(nameKey(row.nome)) || [])
      .sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 6).reverse();
    const previous = storico[storico.length - 1] || null;
    const best = storico.reduce((max, item) => (item.e1rm && (!max || item.e1rm > max) ? item.e1rm : max), null);
    return {
      exercise_id: row.exercise_id,
      nome: row.nome,
      registrato: row.registrato,
      sets: row.sets,
      ...stats,
      pianificato: row.pianificato,
      storico,
      precedente: previous,
      delta_top_kg: previous && stats.top_kg !== null && previous.top_kg !== null ? round1(stats.top_kg - previous.top_kg) : null,
      delta_volume: previous && stats.volume_kg && previous.volume_kg ? stats.volume_kg - previous.volume_kg : null,
      record_e1rm: !!(stats.e1rm && best && stats.e1rm > best),
    };
  });

  const totals = esercizi.reduce((acc, ex) => ({
    serie: acc.serie + ex.serie,
    ripetizioni: acc.ripetizioni + ex.ripetizioni,
    volume_kg: acc.volume_kg + ex.volume_kg,
  }), { serie: 0, ripetizioni: 0, volume_kg: 0 });

  return {
    fonte,
    esercizi_totali: esercizi.length,
    esercizi_registrati: esercizi.filter((ex) => ex.registrato).length,
    ...totals,
    esercizi,
  };
}
