import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import { colors, spacing, radius, typography } from '../theme';

export default function DietEditorScreen({ route, navigation }) {
  const MEAL_TYPES = ['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena', 'Pre-nanna'];
  const WEEK_DAYS = ['Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato', 'Domenica'];
  const existing = route.params?.diet || null;
  const isEdit = !!existing;

  const [nome, setNome] = useState(existing?.nome || '');
  const [datainizio, setDatainizio] = useState(existing?.datainizio ? String(existing.datainizio).slice(0, 10) : route.params?.date || '');
  const [datafine, setDatafine] = useState(existing?.datafine ? String(existing.datafine).slice(0, 10) : (() => { const date = new Date(`${route.params?.date || new Date().toISOString().slice(0, 10)}T12:00:00`); date.setMonth(date.getMonth() + 6); return date.toISOString().slice(0, 10); })());
  const [macrototali, setMacrototali] = useState(existing?.macrototali || '');
  const [notegenerali, setNotegenerali] = useState(existing?.notegenerali || '');
  const [pasti, setPasti] = useState([]);
  const [saving, setSaving] = useState(false);
  const [foodSearch, setFoodSearch] = useState('');
  const [foodResults, setFoodResults] = useState([]);
  const [foodMealIndex, setFoodMealIndex] = useState(null);
  const [mealMenuIndex, setMealMenuIndex] = useState(null);
  const [foodGrams, setFoodGrams] = useState({});
  const [editingMealIndex, setEditingMealIndex] = useState(null);

  useEffect(() => {
    if (isEdit) {
      api.get(`/diets/${existing.dietaid}`).then(({ data }) => setPasti((data.pasti || []).map((p) => ({ ...p, manualDescription: p.descrizione || '', alimenti: [], saved: true }))));
    }
  }, [isEdit]);

  const addMeal = () => setPasti((prev) => [...prev, { giorno_settimana: 'Lunedi', tipopasto: '', manualDescription: '', descrizione: '', alimenti: [], saved: false }]);
  const updateMeal = (idx, field, value) => setPasti((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  const removeMeal = (idx) => setPasti((prev) => prev.filter((_, i) => i !== idx));

  useEffect(() => {
    if (foodMealIndex === null || foodSearch.trim().length < 2) {
      setFoodResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/diets/foods/search', { params: { q: foodSearch.trim() } });
        if (!cancelled) setFoodResults(data || []);
      } catch {
        if (!cancelled) setFoodResults([]);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [foodSearch, foodMealIndex]);

  const addFoodToMeal = (mealIndex, food) => {
    const grams = Number(foodGrams[food.code]);
    if (!Number.isFinite(grams) || grams <= 0) {
      Alert.alert('Grammatura richiesta', 'Inserisci una grammatura maggiore di zero.');
      return;
    }
    setPasti((prev) => prev.map((meal, index) => index === mealIndex ? {
      ...meal,
      alimenti: [...(meal.alimenti || []), { food, grams }],
    } : meal));
    setFoodGrams((prev) => ({ ...prev, [food.code]: '' }));
    setFoodSearch('');
    setFoodResults([]);
    setFoodMealIndex(null);
  };

  const updateFoodGrams = (mealIndex, foodIndex, value) => setPasti((prev) => prev.map((meal, index) => {
    if (index !== mealIndex) return meal;
    const alimenti = (meal.alimenti || []).map((item, itemIndex) => itemIndex === foodIndex ? { ...item, grams: value === '' ? '' : Number(value) || 0 } : item);
    return { ...meal, alimenti, descrizione: [meal.manualDescription, ...alimenti.map((item) => `${item.food.product_name} - ${item.grams || 0} g`)].filter(Boolean).join('\n') };
  }));

  const removeFood = (mealIndex, foodIndex) => setPasti((prev) => prev.map((meal, index) => index === mealIndex ? {
    ...meal, alimenti: (meal.alimenti || []).filter((_, itemIndex) => itemIndex !== foodIndex),
  } : meal));

  const saveMealAndContinue = (mealIndex) => {
    const meal = pasti[mealIndex];
    if (!meal?.tipopasto) return Alert.alert('Errore', 'Seleziona il tipo di pasto');
    const descrizione = [meal.manualDescription, ...(meal.alimenti || []).map((item) => `${item.food.product_name} - ${item.grams || 0} g`)].filter(Boolean).join('\n');
    setPasti((prev) => prev.map((item, index) => index === mealIndex ? { ...item, descrizione, saved: true } : item));
    setFoodSearch('');
    setFoodResults([]);
    setFoodMealIndex(null);
    setEditingMealIndex(null);
    addMeal();
  };

  const editMeal = (mealIndex) => {
    setEditingMealIndex(mealIndex);
    setFoodMealIndex(null);
    setFoodSearch('');
    setFoodResults([]);
  };

  const macroValue = (food, key, grams) => {
    const number = Number.parseFloat(String(food[key] ?? '').replace(',', '.'));
    return Number.isFinite(number) ? number * (grams / 100) : 0;
  };

  const mealMacros = (meal) => (meal.alimenti || []).reduce((total, item) => ({
    kcal: total.kcal + macroValue(item.food, 'energy_kcal_100g', item.grams),
    proteins: total.proteins + macroValue(item.food, 'proteins_100g', item.grams),
    carbs: total.carbs + macroValue(item.food, 'carbohydrates_100g', item.grams),
    fat: total.fat + macroValue(item.food, 'fat_100g', item.grams),
  }), { kcal: 0, proteins: 0, carbs: 0, fat: 0 });

  const addMacros = (left, right) => ({
    kcal: left.kcal + right.kcal,
    proteins: left.proteins + right.proteins,
    carbs: left.carbs + right.carbs,
    fat: left.fat + right.fat,
  });

  const dietMacros = pasti.reduce((total, meal) => addMacros(total, mealMacros(meal)), { kcal: 0, proteins: 0, carbs: 0, fat: 0 });
  const dayMacros = (day) => pasti.filter((meal) => (meal.giorno_settimana || 'Lunedi') === day).reduce((total, meal) => addMacros(total, mealMacros(meal)), { kcal: 0, proteins: 0, carbs: 0, fat: 0 });

  const onSave = async () => {
    if (!nome) return Alert.alert('Errore', 'Il nome della dieta e richiesto');
    setSaving(true);
    try {
      const total = pasti.reduce((sum, meal) => { const macros = mealMacros(meal); return { kcal: sum.kcal + macros.kcal, proteins: sum.proteins + macros.proteins, carbs: sum.carbs + macros.carbs, fat: sum.fat + macros.fat }; }, { kcal: 0, proteins: 0, carbs: 0, fat: 0 });
      const payload = { nome, datainizio: datainizio || null, datafine: datafine || null, macrototali: macrototali || `Kcal: ${Math.round(total.kcal)} P: ${Math.round(total.proteins)} C: ${Math.round(total.carbs)} F: ${Math.round(total.fat)}`, notegenerali };
      const savedMeals = pasti.map((meal) => ({ ...meal, descrizione: [meal.manualDescription, ...(meal.alimenti || []).map((item) => `${item.food.product_name} - ${item.grams || 0} g`)].filter(Boolean).join('\n') || meal.descrizione }));
      let dietId = existing?.dietaid;
      if (isEdit) {
        await api.put(`/diets/${dietId}`, payload);
        await api.put(`/diets/${dietId}/meals`, { pasti: savedMeals });
      } else {
        const { data: created } = await api.post('/diets', { ...payload, utenteId: route.params?.utenteId, pasti: savedMeals });
        dietId = created.dietaid;
      }
      Alert.alert('Dieta salvata', 'La dieta e i pasti sono stati salvati correttamente.');
      navigation.replace('DietDetail', { dietId });
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile salvare la dieta');
    } finally {
      setSaving(false);
    }
  };

  const renderMealCard = (pasto, idx) => {
    const editable = !pasto.saved || editingMealIndex === idx;
    return (
    <View key={idx} style={styles.mealCard}>
      <View style={styles.mealCardHeader}>
        <Pressable style={[styles.input, styles.selectInput]} onPress={() => editable && setMealMenuIndex(idx)}>
          <Text style={pasto.tipopasto ? styles.selectText : styles.placeholderText}>{pasto.tipopasto || 'Seleziona tipo pasto'}</Text>
        </Pressable>
        <Pressable onPress={() => removeMeal(idx)} style={styles.removeBtn}><Text style={styles.removeBtnText}>✕</Text></Pressable>
      </View>
      <View style={styles.dayRow}>
        <Text style={styles.dayLabel}>Giorno</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysRow}>
          {WEEK_DAYS.map((day) => <Pressable key={day} style={[styles.dayChip, pasto.giorno_settimana === day && styles.dayChipActive]} onPress={() => updateMeal(idx, 'giorno_settimana', day)}><Text style={[styles.dayChipText, pasto.giorno_settimana === day && styles.dayChipTextActive]}>{day}</Text></Pressable>)}
        </ScrollView>
      </View>
      {editable ? <TextInput value={pasto.manualDescription ?? ''} onChangeText={(v) => updateMeal(idx, 'manualDescription', v)} placeholder="Descrizione manuale" style={styles.input} /> : <Text style={styles.readOnlyDescription}>{pasto.descrizione || 'Nessuna descrizione'}</Text>}
      {editable && <TextInput value={foodMealIndex === idx ? foodSearch : ''} onFocus={() => setFoodMealIndex(idx)} onChangeText={(value) => { setFoodMealIndex(idx); setFoodSearch(value); }} placeholder="Cerca alimento nella tabella nutrizionale" style={styles.input} />}
      {!pasto.saved && foodMealIndex === idx && foodResults.map((food) => (
        <View key={food.code} style={styles.foodResult}>
          <Text style={styles.foodName}>{food.product_name}</Text>
          <Text style={styles.foodMeta}>{food.energy_kcal_100g ?? '—'} kcal · P {food.proteins_100g ?? '—'} · C {food.carbohydrates_100g ?? '—'} · F {food.fat_100g ?? '—'}</Text>
          <View style={styles.foodActionRow}><TextInput value={String(foodGrams[food.code] ?? '')} onChangeText={(value) => setFoodGrams((prev) => ({ ...prev, [food.code]: value }))} keyboardType="numeric" style={styles.gramInput} placeholder="g" /><Text style={styles.gramLabel}>grammi</Text><Pressable style={styles.addFoodButton} onPress={() => addFoodToMeal(idx, food)}><Text style={styles.addFoodText}>+</Text></Pressable></View>
        </View>
      ))}
      {(pasto.alimenti || []).map((item, foodIndex) => <View key={`${item.food.code}-${foodIndex}`} style={styles.selectedFood}><Text style={styles.foodName}>{item.food.product_name}</Text><View style={styles.gramRow}>{editable ? <TextInput value={String(item.grams ?? '')} onChangeText={(v) => updateFoodGrams(idx, foodIndex, v)} keyboardType="numeric" style={styles.gramInput} placeholder="g" /> : <Text style={styles.readOnlyGrams}>{item.grams} g</Text>}{editable && <><Text style={styles.gramLabel}>grammi</Text><Pressable onPress={() => removeFood(idx, foodIndex)}><Text style={styles.removeFoodText}>Rimuovi</Text></Pressable></>}</View></View>)}
      {(pasto.alimenti || []).length > 0 && <Text style={styles.macroSummary}>Totale pasto: {Math.round(mealMacros(pasto).kcal)} kcal · P {Math.round(mealMacros(pasto).proteins)} g · C {Math.round(mealMacros(pasto).carbs)} g · F {Math.round(mealMacros(pasto).fat)} g</Text>}
      <Text style={styles.dailySummary}>Totale {pasto.giorno_settimana || 'Lunedi'}: {Math.round(dayMacros(pasto.giorno_settimana || 'Lunedi').kcal)} kcal · P {Math.round(dayMacros(pasto.giorno_settimana || 'Lunedi').proteins)} g · C {Math.round(dayMacros(pasto.giorno_settimana || 'Lunedi').carbs)} g · F {Math.round(dayMacros(pasto.giorno_settimana || 'Lunedi').fat)} g</Text>
      <Text style={styles.dietSummary}>Totale dieta: {Math.round(dietMacros.kcal)} kcal · P {Math.round(dietMacros.proteins)} g · C {Math.round(dietMacros.carbs)} g · F {Math.round(dietMacros.fat)} g</Text>
      {editable ? <Pressable style={styles.saveMealButton} onPress={() => saveMealAndContinue(idx)}><Text style={styles.saveMealText}>{pasto.saved ? 'Salva modifiche pasto' : 'Salva pasto e continua'}</Text></Pressable> : <Pressable style={styles.editMealButton} onPress={() => editMeal(idx)}><Text style={styles.editMealText}>Modifica pasto</Text></Pressable>}
    </View>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h1}>{isEdit ? 'Modifica dieta' : 'Nuova dieta'}</Text>

      <Text style={styles.fieldLabel}>Nome</Text>
      <TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Dieta definizione" />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Inizio</Text>
          <DateField value={datainizio} onChange={setDatainizio} style={styles.dateField} />
        </View>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Fine</Text>
          <DateField value={datafine} onChange={setDatafine} style={styles.dateField} />
        </View>
      </View>

      <Text style={styles.fieldLabel}>Macro totali</Text>
      <TextInput value={macrototali} onChangeText={setMacrototali} style={styles.input} placeholder="Kcal:2200 P:160 C:240 F:70" />

      <Text style={styles.fieldLabel}>Note generali</Text>
      <TextInput value={notegenerali} onChangeText={setNotegenerali} style={[styles.input, styles.textArea]} multiline />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={typography.h3}>Pasti</Text>
          <Pressable onPress={addMeal}><Text style={styles.addLink}>+ Aggiungi</Text></Pressable>
        </View>
        <View style={styles.currentSection}><Text style={typography.h3}>Pasto in compilazione</Text>{pasti.map((pasto, idx) => !pasto.saved && renderMealCard(pasto, idx))}</View>
        {pasti.some((pasto) => pasto.saved) && <View style={styles.structuredSection}><Text style={typography.h3}>Dieta strutturata</Text>{pasti.map((pasto, idx) => pasto.saved && renderMealCard(pasto, idx))}</View>}
      </View>

      <Modal visible={mealMenuIndex !== null} transparent animationType="fade" onRequestClose={() => setMealMenuIndex(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMealMenuIndex(null)}><View style={styles.menuCard}>
          {MEAL_TYPES.map((type) => <Pressable key={type} style={styles.menuOption} onPress={() => { updateMeal(mealMenuIndex, 'tipopasto', type); setMealMenuIndex(null); }}><Text style={styles.menuOptionText}>{type}</Text></Pressable>)}
        </View></Pressable>
      </Modal>

      <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Salva dieta</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  section: { marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addLink: { color: colors.accent, fontWeight: '700' },
  mealCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  mealCardHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  structuredSection: { marginBottom: spacing.lg },
  currentSection: { marginTop: spacing.md },
  dayRow: { marginBottom: spacing.sm },
  dayLabel: { ...typography.caption, marginBottom: spacing.xs },
  daysRow: { gap: spacing.xs },
  dayChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  dayChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  dayChipText: { color: colors.textMuted, fontSize: 12 },
  dayChipTextActive: { color: colors.primary, fontWeight: '700' },
  removeBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.danger, fontWeight: '700' },
  foodResult: { padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  foodName: { fontWeight: '700', color: colors.text },
  foodMeta: { ...typography.caption, marginTop: 2 },
  foodActionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  addFoodButton: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addFoodText: { color: colors.textInverse, fontSize: 22, fontWeight: '700' },
  selectedFood: { padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.sm, backgroundColor: colors.primaryLight },
    readOnlyDescription: { ...typography.body, paddingVertical: spacing.sm, color: colors.textMuted },
    readOnlyGrams: { ...typography.caption, fontWeight: '700', color: colors.text },
  gramRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  gramInput: { width: 72, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, backgroundColor: colors.surface },
  gramLabel: { ...typography.caption },
  removeFoodText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  macroSummary: { color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
  dailySummary: { color: colors.text, fontWeight: '700', marginTop: spacing.xs },
  dietSummary: { color: colors.accent, fontWeight: '800', marginTop: spacing.xs },
  saveMealButton: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  saveMealText: { color: colors.primary, fontWeight: '700' },
    editMealButton: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
    editMealText: { color: colors.text, fontWeight: '700' },
  selectInput: { flex: 1, justifyContent: 'center' },
  selectText: { color: colors.text },
  placeholderText: { color: colors.textMuted },
  menuOverlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: spacing.xl },
  menuCard: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  menuOption: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuOptionText: { color: colors.text, fontWeight: '600' },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xxl },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
});
