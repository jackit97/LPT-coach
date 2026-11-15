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

// Ripartizione macro consigliata sul target calorico (g/kg di peso corporeo).
// Proteine piu' alte in definizione, grassi ~0.9 g/kg (minimo 20% kcal), carboidrati a completamento.
export function macroTargets({ kcal, pesoKg, goalKey }) {
  const kg = toNumber(pesoKg);
  const total = toNumber(kcal);
  if (!kg || !total) return null;
  const proteinPerKg = goalKey === 'definizione' ? 2.2 : goalKey === 'massa' ? 1.8 : 2.0;
  const proteins = kg * proteinPerKg;
  const fat = Math.max(kg * 0.9, (total * 0.2) / 9);
  const carbs = Math.max(0, (total - proteins * 4 - fat * 9) / 4);
  return { kcal: Math.round(total), proteins: Math.round(proteins), carbs: Math.round(carbs), fat: Math.round(fat) };
}

// Colori macro coerenti in tutta la sezione diete.
export const MACRO_COLORS = { proteins: '#2563eb', carbs: '#f59e0b', fat: '#db2777', kcal: '#0B3D91' };

export const QUICK_GRAMS = [30, 50, 80, 100, 150, 200];

export const dayShort = (day) => day.slice(0, 3);

// Testo leggibile del pasto (usato per PDF, calendario e compatibilita' con le diete vecchie).
export function mealDescription(manuale, alimenti) {
  return [manuale, ...(alimenti || []).map((item) => `${item.food.product_name} - ${toNumber(item.grams)} g`)].filter(Boolean).join('\n');
}

// Riduce l'alimento ai soli campi necessari prima di salvarlo in alimenti_json.
export const compactFood = (food) => ({
  code: food.code,
  product_name: food.product_name,
  brands: food.brands || null,
  energy_kcal_100g: food.energy_kcal_100g,
  proteins_100g: food.proteins_100g,
  carbohydrates_100g: food.carbohydrates_100g,
  fat_100g: food.fat_100g,
});
