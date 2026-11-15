// Calcoli nutrizionali condivisi tra editor e dettaglio dieta.

export const WEEK_DAYS = ['Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato', 'Domenica'];
export const MEAL_TYPES = ['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena', 'Pre-nanna'];
export const MEAL_ICONS = { Colazione: '☕', Spuntino: '🍎', Pranzo: '🍝', Merenda: '🥜', Cena: '🍽', 'Pre-nanna': '🌙' };

export const toNumber = (value) => {
  const number = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
};

export const EMPTY_MACROS = { kcal: 0, proteins: 0, carbs: 0, fat: 0 };

// item: { food: valori per 100 g, grams }
export function foodMacros(item) {
  const grams = toNumber(item.grams);
  const factor = grams / 100;
  return {
    kcal: toNumber(item.food.energy_kcal_100g) * factor,
    proteins: toNumber(item.food.proteins_100g) * factor,
    carbs: toNumber(item.food.carbohydrates_100g) * factor,
    fat: toNumber(item.food.fat_100g) * factor,
  };
}

export const addMacros = (a, b) => ({ kcal: a.kcal + b.kcal, proteins: a.proteins + b.proteins, carbs: a.carbs + b.carbs, fat: a.fat + b.fat });

export const mealMacros = (meal) => (meal.alimenti || []).reduce((total, item) => addMacros(total, foodMacros(item)), EMPTY_MACROS);

export function parseMealFoods(pasto) {
  if (!pasto?.alimenti_json) return { manuale: pasto?.descrizione || '', alimenti: [] };
  try {
    const parsed = typeof pasto.alimenti_json === 'string' ? JSON.parse(pasto.alimenti_json) : pasto.alimenti_json;
    return { manuale: parsed.manuale || '', alimenti: Array.isArray(parsed.alimenti) ? parsed.alimenti : [] };
  } catch {
    return { manuale: pasto?.descrizione || '', alimenti: [] };
  }
}

export const formatMacros = (m, withUnits = true) => withUnits
  ? `${Math.round(m.kcal)} kcal · P ${Math.round(m.proteins)}g · C ${Math.round(m.carbs)}g · G ${Math.round(m.fat)}g`
  : `${Math.round(m.kcal)} kcal`;

// ---- Calcolatore fabbisogno (Mifflin-St Jeor) ----
export const ACTIVITY_LEVELS = [
  { key: 'sedentario', label: 'Sedentario', factor: 1.2, hint: 'Poco o nessun esercizio' },
  { key: 'leggero', label: 'Leggero', factor: 1.375, hint: '1-3 allenamenti/settimana' },
  { key: 'moderato', label: 'Moderato', factor: 1.55, hint: '3-5 allenamenti/settimana' },
  { key: 'intenso', label: 'Intenso', factor: 1.725, hint: '6-7 allenamenti/settimana' },
  { key: 'atleta', label: 'Atleta', factor: 1.9, hint: 'Doppi allenamenti / lavoro fisico' },
];

export const GOALS = [
  { key: 'definizione', label: 'Definizione', delta: -0.15 },
  { key: 'mantenimento', label: 'Mantenimento', delta: 0 },
  { key: 'massa', label: 'Massa', delta: 0.1 },
];

export function ageFromBirthDate(value) {
  if (!value) return null;
  const birth = new Date(String(value).slice(0, 10));
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age > 0 && age < 120 ? age : null;
}

// Restituisce { bmr, tdee, target } oppure null se mancano i dati.
export function computeNeeds({ pesoKg, altezzaCm, eta, sesso, activityKey, goalKey }) {
  const kg = toNumber(pesoKg);
  const cm = toNumber(altezzaCm);
  const age = toNumber(eta);
  if (!kg || !cm || !age) return null;
  const male = String(sesso || '').toLowerCase().startsWith('m');
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (male ? 5 : -161);
  const activity = ACTIVITY_LEVELS.find((level) => level.key === activityKey) || ACTIVITY_LEVELS[2];
  const goal = GOALS.find((item) => item.key === goalKey) || GOALS[1];
  const tdee = bmr * activity.factor;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), target: Math.round(tdee * (1 + goal.delta)) };
}
