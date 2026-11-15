import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import MacroSummary, { MacroSplitBar } from '../components/MacroSummary';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';
import {
  WEEK_DAYS, MEAL_TYPES, MEAL_ICONS, EMPTY_MACROS, QUICK_GRAMS, ACTIVITY_LEVELS, GOALS,
  toNumber, foodMacros, addMacros, mealMacros, parseMealFoods, mealDescription, compactFood,
  computeNeeds, macroTargets, ageFromBirthDate, dayShort,
} from '../utils/nutrition';

let keySeed = 0;
const newKey = () => `m${Date.now()}-${keySeed += 1}`;
const mealOrder = (meal) => { const index = MEAL_TYPES.indexOf(meal.tipopasto); return index === -1 ? 99 : index; };
const sixMonthsFrom = (iso) => { const date = new Date(`${iso}T12:00:00`); date.setMonth(date.getMonth() + 6); return date.toISOString().slice(0, 10); };

export default function DietEditorScreen({ route, navigation }) {
  const { selectedAthlete, targetUserId } = useAthlete();
  const dietId = route.params?.dietId || route.params?.diet?.dietaid || null;
  const isEdit = !!dietId;
  const startIso = route.params?.date || new Date().toISOString().slice(0, 10);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [datainizio, setDatainizio] = useState(startIso);
  const [datafine, setDatafine] = useState(sixMonthsFrom(startIso));
  const [notegenerali, setNotegenerali] = useState(route.params?.coachNote || '');
  const [pasti, setPasti] = useState([]);
  const [activeDay, setActiveDay] = useState(WEEK_DAYS[0]);

  // Calcolatore fabbisogno (precompilato dal profilo atleta)
  const [needs, setNeeds] = useState({
    pesoKg: selectedAthlete?.pesokg ? String(selectedAthlete.pesokg) : '',
    altezzaCm: selectedAthlete?.altezzacm ? String(selectedAthlete.altezzacm) : '',
    eta: ageFromBirthDate(selectedAthlete?.datanascita) ? String(ageFromBirthDate(selectedAthlete?.datanascita)) : '',
    sesso: selectedAthlete?.sesso || 'M',
    activityKey: 'moderato',
    goalKey: 'mantenimento',
    customKcal: '',
  });
  const [calcOpen, setCalcOpen] = useState(!isEdit);

  // Ricerca alimenti (una sola ricerca attiva, legata al pasto)
  const [searchMealKey, setSearchMealKey] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addMealOpen, setAddMealOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState([]);
  const searchTimer = useRef(null);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/diets/${dietId}`)
      .then(({ data }) => {
        setNome(data.nome || '');
        if (data.datainizio) setDatainizio(String(data.datainizio).slice(0, 10));
        if (data.datafine) setDatafine(String(data.datafine).slice(0, 10));
        setNotegenerali(data.notegenerali || '');
        if (data.fabbisogno_json) {
          try { setNeeds((current) => ({ ...current, ...JSON.parse(data.fabbisogno_json) })); } catch { /* ignore */ }
        }
        setPasti((data.pasti || []).map((pasto) => {
          const parsed = parseMealFoods(pasto);
          return { key: newKey(), giorno_settimana: pasto.giorno_settimana || 'Lunedi', tipopasto: pasto.tipopasto || 'Pranzo', manuale: parsed.manuale, alimenti: parsed.alimenti };
        }));
      })
      .catch(() => Alert.alert('Errore', 'Impossibile caricare la dieta'))
      .finally(() => setLoading(false));
  }, [isEdit, dietId]);

  // Ricerca con debounce
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!searchMealKey || query.trim().length < 2) { setResults([]); setSearching(false); return undefined; }
    setSearching(true);
    let cancelled = false;
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/diets/foods/search', { params: { q: query.trim() } });
        if (!cancelled) setResults(data || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(searchTimer.current); };
  }, [query, searchMealKey]);

  // ---- Fabbisogno ----
  const computed = computeNeeds(needs);
  const targetKcal = toNumber(needs.customKcal) || computed?.target || 0;
  const target = macroTargets({ kcal: targetKcal, pesoKg: needs.pesoKg, goalKey: needs.goalKey });
  const setNeed = (field, value) => setNeeds((current) => ({ ...current, [field]: value }));

  // ---- Totali ----
  const dayTotals = useMemo(() => Object.fromEntries(WEEK_DAYS.map((day) => [
    day,
    pasti.filter((meal) => meal.giorno_settimana === day).reduce((total, meal) => addMacros(total, mealMacros(meal)), EMPTY_MACROS),
  ])), [pasti]);
  const plannedDays = WEEK_DAYS.filter((day) => pasti.some((meal) => meal.giorno_settimana === day));
  const average = plannedDays.length
    ? Object.fromEntries(Object.keys(EMPTY_MACROS).map((key) => [key, plannedDays.reduce((sum, day) => sum + dayTotals[day][key], 0) / plannedDays.length]))
    : EMPTY_MACROS;
  const dayMeals = pasti.filter((meal) => meal.giorno_settimana === activeDay).sort((a, b) => mealOrder(a) - mealOrder(b));

  // ---- Pasti ----
  const updateMeal = (key, patch) => setPasti((current) => current.map((meal) => (meal.key === key ? { ...meal, ...patch } : meal)));
  const addMeal = (tipopasto) => {
    const key = newKey();
    setPasti((current) => [...current, { key, giorno_settimana: activeDay, tipopasto, manuale: '', alimenti: [] }]);
    setAddMealOpen(false);
    setSearchMealKey(key);
    setQuery('');
  };
  const removeMeal = (key) => setPasti((current) => current.filter((meal) => meal.key !== key));
  const addFood = (meal, food, grams = 100) => {
    updateMeal(meal.key, { alimenti: [...meal.alimenti, { food: compactFood(food), grams }] });
    setQuery('');
    setResults([]);
  };
  const setFoodGrams = (meal, index, value) => updateMeal(meal.key, {
    alimenti: meal.alimenti.map((item, itemIndex) => (itemIndex === index ? { ...item, grams: value.replace(',', '.').replace(/[^0-9.]/g, '') } : item)),
  });
  const removeFood = (meal, index) => updateMeal(meal.key, { alimenti: meal.alimenti.filter((_, itemIndex) => itemIndex !== index) });

  const copyDay = () => {
    if (!copyTargets.length) { setCopyOpen(false); return; }
    const source = pasti.filter((meal) => meal.giorno_settimana === activeDay);
    setPasti((current) => [
      ...current.filter((meal) => !copyTargets.includes(meal.giorno_settimana)),
      ...copyTargets.flatMap((day) => source.map((meal) => ({ ...JSON.parse(JSON.stringify(meal)), key: newKey(), giorno_settimana: day }))),
    ]);
    setCopyOpen(false);
    setCopyTargets([]);
  };

  const onSave = async () => {
    if (!nome.trim()) return Alert.alert('Errore', 'Il nome della dieta è richiesto');
    if (datainizio && datafine && datafine < datainizio) return Alert.alert('Errore', 'La data di fine è precedente all\'inizio');
    setSaving(true);
    try {
      const macrototali = plannedDays.length
        ? `Kcal: ${Math.round(average.kcal)} P: ${Math.round(average.proteins)} C: ${Math.round(average.carbs)} F: ${Math.round(average.fat)}`
        : (target ? `Kcal: ${target.kcal} P: ${target.proteins} C: ${target.carbs} F: ${target.fat}` : null);
      const payload = {
        nome: nome.trim(),
        datainizio: datainizio || null,
        datafine: datafine || null,
        macrototali,
        notegenerali,
        fabbisogno: { ...needs, target: target || null },
      };
      const meals = pasti.map((meal) => {
        const alimenti = meal.alimenti.filter((item) => toNumber(item.grams) > 0);
        return {
          giorno_settimana: meal.giorno_settimana,
          tipopasto: meal.tipopasto,
          descrizione: mealDescription(meal.manuale, alimenti),
          alimenti_json: JSON.stringify({ manuale: meal.manuale || '', alimenti }),
        };
      });
      let id = dietId;
      if (isEdit) {
        await api.put(`/diets/${id}`, payload);
        await api.put(`/diets/${id}/meals`, { pasti: meals });
      } else {
        const { data: created } = await api.post('/diets', { ...payload, utenteId: route.params?.utenteId || targetUserId, pasti: meals });
        id = created.dietaid;
      }
      navigation.replace('DietDetail', { dietId: id });
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile salvare la dieta');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  const renderMeal = (meal) => {
    const totals = mealMacros(meal);
    const searchingHere = searchMealKey === meal.key;
    return (
      <View key={meal.key} style={styles.mealCard}>
        <View style={styles.mealHeader}>
          <Text style={styles.mealIcon}>{MEAL_ICONS[meal.tipopasto] || '🍽'}</Text>
          <Text style={styles.mealTitle}>{meal.tipopasto}</Text>
          <Text style={styles.mealKcal}>{Math.round(totals.kcal)} kcal</Text>
          <Pressable onPress={() => removeMeal(meal.key)} hitSlop={6}><Text style={styles.removeIcon}>🗑</Text></Pressable>
        </View>
        <Text style={styles.mealMacros}>P {Math.round(totals.proteins)}g · C {Math.round(totals.carbs)}g · G {Math.round(totals.fat)}g</Text>

        {meal.alimenti.map((item, index) => {
          const itemMacros = foodMacros(item);
          return (
            <View key={`${item.food.code}-${index}`} style={styles.foodRow}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text style={styles.foodName} numberOfLines={2}>{item.food.product_name}</Text>
                <Text style={styles.foodMeta}>{Math.round(itemMacros.kcal)} kcal · P {Math.round(itemMacros.proteins)} · C {Math.round(itemMacros.carbs)} · G {Math.round(itemMacros.fat)}</Text>
              </View>
              <View style={styles.gramBox}>
                <TextInput value={String(item.grams ?? '')} onChangeText={(value) => setFoodGrams(meal, index, value)} keyboardType="decimal-pad" style={styles.gramInput} selectTextOnFocus />
                <Text style={styles.gramUnit}>g</Text>
              </View>
              <Pressable onPress={() => removeFood(meal, index)} hitSlop={6}><Text style={styles.removeFood}>✕</Text></Pressable>
            </View>
          );
        })}

        <TextInput
          value={searchingHere ? query : ''}
          onFocus={() => { if (!searchingHere) { setSearchMealKey(meal.key); setQuery(''); } }}
          onChangeText={(value) => { setSearchMealKey(meal.key); setQuery(value); }}
          placeholder="🔍 Cerca alimento"
          style={styles.searchInput}
        />
        {searchingHere && query.trim().length >= 2 && (
          <View style={styles.results}>
            {searching && <ActivityIndicator color={colors.primary} style={{ margin: spacing.sm }} />}
            {!searching && !results.length && <Text style={styles.noResults}>Nessun alimento trovato</Text>}
            {results.slice(0, 12).map((food) => (
              <View key={food.code} style={styles.resultRow}>
                <Pressable style={{ flex: 1 }} onPress={() => addFood(meal, food, 100)}>
                  <Text style={styles.foodName} numberOfLines={1}>
                    {food.product_name}{food.source === 'off' && food.brands ? <Text style={styles.brand}> · {food.brands}</Text> : null}
                  </Text>
                  <Text style={styles.foodMeta}>
                    per 100 g: {food.energy_kcal_100g} kcal · P {food.proteins_100g ?? '—'} · C {food.carbohydrates_100g ?? '—'} · G {food.fat_100g ?? '—'}
                    {food.kcal_calcolate ? ' · kcal stimate' : ''}
                  </Text>
                </Pressable>
                <View style={styles.quickGrams}>
                  {QUICK_GRAMS.slice(1, 5).map((grams) => (
                    <Pressable key={grams} style={styles.quickGram} onPress={() => addFood(meal, food, grams)}>
                      <Text style={styles.quickGramText}>{grams}g</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
        <TextInput
          value={meal.manuale}
          onChangeText={(value) => updateMeal(meal.key, { manuale: value })}
          placeholder="Note / alternative"
          style={styles.noteInput}
          multiline
        />
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.backLink}>‹ Annulla</Text></Pressable>
        <Pressable style={styles.saveTopBtn} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveTopText}>Salva dieta</Text>}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Intestazione */}
        <View style={styles.panel}>
          <TextInput value={nome} onChangeText={setNome} style={styles.titleInput} placeholder="Nome dieta" />
          <View style={styles.row}>
            <View style={styles.half}><Text style={styles.label}>Inizio</Text><DateField value={datainizio} onChange={setDatainizio} /></View>
            <View style={styles.half}><Text style={styles.label}>Fine</Text><DateField value={datafine} onChange={setDatafine} /></View>
          </View>
          <Text style={styles.label}>Note generali</Text>
          <TextInput value={notegenerali} onChangeText={setNotegenerali} style={[styles.input, styles.area]} multiline placeholder="Note generali" />
        </View>

        {/* Calcolatore fabbisogno */}
        <View style={styles.panel}>
          <Pressable style={styles.panelHeader} onPress={() => setCalcOpen((value) => !value)}>
            <Text style={styles.panelTitle}>Fabbisogno calorico</Text>
            <Text style={styles.link}>{calcOpen ? 'Nascondi ▴' : `${targetKcal ? `${targetKcal} kcal · ` : ''}Modifica ▾`}</Text>
          </Pressable>
          {calcOpen && (
            <>
              <View style={styles.row}>
                <View style={styles.third}><Text style={styles.label}>Peso (kg)</Text><TextInput value={String(needs.pesoKg)} onChangeText={(v) => setNeed('pesoKg', v)} keyboardType="decimal-pad" style={styles.input} placeholder="Peso" /></View>
                <View style={styles.third}><Text style={styles.label}>Altezza (cm)</Text><TextInput value={String(needs.altezzaCm)} onChangeText={(v) => setNeed('altezzaCm', v)} keyboardType="numeric" style={styles.input} placeholder="Altezza" /></View>
                <View style={styles.third}><Text style={styles.label}>Età</Text><TextInput value={String(needs.eta)} onChangeText={(v) => setNeed('eta', v)} keyboardType="numeric" style={styles.input} placeholder="Età" /></View>
              </View>
              <Text style={styles.label}>Sesso</Text>
              <View style={styles.chips}>
                {[['M', 'Uomo'], ['F', 'Donna']].map(([key, label]) => (
                  <Pressable key={key} style={[styles.chip, String(needs.sesso).toUpperCase().startsWith(key) && styles.chipActive]} onPress={() => setNeed('sesso', key)}>
                    <Text style={[styles.chipText, String(needs.sesso).toUpperCase().startsWith(key) && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Livello di attività</Text>
              <View style={styles.chips}>
                {ACTIVITY_LEVELS.map((level) => (
                  <Pressable key={level.key} style={[styles.chip, needs.activityKey === level.key && styles.chipActive]} onPress={() => setNeed('activityKey', level.key)}>
                    <Text style={[styles.chipText, needs.activityKey === level.key && styles.chipTextActive]}>{level.label}</Text>
                    <Text style={styles.chipHint}>{level.hint}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Obiettivo</Text>
              <View style={styles.chips}>
                {GOALS.map((goal) => (
                  <Pressable key={goal.key} style={[styles.chip, needs.goalKey === goal.key && styles.chipActive]} onPress={() => setNeed('goalKey', goal.key)}>
                    <Text style={[styles.chipText, needs.goalKey === goal.key && styles.chipTextActive]}>
                      {goal.label}{goal.delta ? ` (${goal.delta > 0 ? '+' : ''}${Math.round(goal.delta * 100)}%)` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.needsRow}>
                <View style={styles.needCard}><Text style={styles.needLabel}>Metabolismo basale</Text><Text style={styles.needValue}>{computed ? `${computed.bmr} kcal` : '—'}</Text></View>
                <View style={styles.needCard}><Text style={styles.needLabel}>Dispendio giornaliero</Text><Text style={styles.needValue}>{computed ? `${computed.tdee} kcal` : '—'}</Text></View>
                <View style={[styles.needCard, styles.needCardMain]}>
                  <Text style={styles.needLabel}>Obiettivo giornaliero</Text>
                  <TextInput
                    value={String(needs.customKcal || '')}
                    onChangeText={(v) => setNeed('customKcal', v.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    placeholder={computed ? String(computed.target) : 'kcal'}
                    style={styles.needInput}
                  />
                  <Text style={styles.needHint}>{needs.customKcal ? 'valore personalizzato' : 'calcolato (Mifflin-St Jeor)'}</Text>
                </View>
              </View>
              {target && <Text style={styles.targetLine}>Macro consigliati: P {target.proteins} g · C {target.carbs} g · G {target.fat} g</Text>}
              {!computed && <Text style={styles.hint}>Inserisci peso, altezza ed età per calcolare il fabbisogno.</Text>}
            </>
          )}
        </View>

        {/* Settimana */}
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Piano settimanale</Text>
            {plannedDays.length > 0 && <Text style={styles.avgText}>Media: {Math.round(average.kcal)} kcal/giorno</Text>}
          </View>
          <View style={styles.weekStrip}>
            {WEEK_DAYS.map((day) => {
              const kcal = Math.round(dayTotals[day].kcal);
              const ok = targetKcal && kcal ? Math.abs(kcal - targetKcal) / targetKcal <= 0.1 : null;
              return (
                <Pressable key={day} style={[styles.dayTab, activeDay === day && styles.dayTabActive]} onPress={() => setActiveDay(day)}>
                  <Text style={[styles.dayTabName, activeDay === day && styles.dayTabNameActive]}>{dayShort(day)}</Text>
                  <Text style={[styles.dayTabKcal, ok === true && { color: colors.success }, ok === false && { color: colors.warning }]}>{kcal || '—'}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.dayHeader}>
            <Text style={typography.h3}>{activeDay}</Text>
            <View style={styles.dayActions}>
              <Pressable style={styles.outlineBtn} onPress={() => { setCopyTargets([]); setCopyOpen(true); }} disabled={!dayMeals.length}>
                <Text style={[styles.outlineBtnText, !dayMeals.length && { opacity: 0.4 }]}>⧉ Copia giorno</Text>
              </Pressable>
              <Pressable style={styles.primarySmall} onPress={() => setAddMealOpen(true)}>
                <Text style={styles.primarySmallText}>+ Pasto</Text>
              </Pressable>
            </View>
          </View>
          <MacroSummary macros={dayTotals[activeDay]} target={target} />
          <View style={{ marginTop: spacing.sm }}><MacroSplitBar macros={dayTotals[activeDay]} /></View>

          {dayMeals.map(renderMeal)}
          {!dayMeals.length && (
            <Pressable style={styles.emptyDay} onPress={() => setAddMealOpen(true)}>
              <Text style={styles.emptyDayText}>Nessun pasto per {activeDay}. Tocca per aggiungerne uno o copia un altro giorno.</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal visible={addMealOpen} transparent animationType="fade" onRequestClose={() => setAddMealOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddMealOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Aggiungi pasto · {activeDay}</Text>
            {MEAL_TYPES.map((type) => (
              <Pressable key={type} style={styles.modalOption} onPress={() => addMeal(type)}>
                <Text style={styles.modalOptionText}>{MEAL_ICONS[type]}  {type}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      <Modal visible={copyOpen} transparent animationType="fade" onRequestClose={() => setCopyOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCopyOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Copia {activeDay} su…</Text>
            <Text style={styles.hint}>I pasti dei giorni selezionati verranno sostituiti.</Text>
            <View style={[styles.chips, { marginVertical: spacing.md }]}>
              {WEEK_DAYS.filter((day) => day !== activeDay).map((day) => {
                const on = copyTargets.includes(day);
                return (
                  <Pressable key={day} style={[styles.chip, on && styles.chipActive]} onPress={() => setCopyTargets((current) => (on ? current.filter((d) => d !== day) : [...current, day]))}>
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.row}>
              <Pressable style={[styles.outlineBtn, { flex: 1 }]} onPress={() => setCopyTargets(WEEK_DAYS.filter((day) => day !== activeDay))}><Text style={styles.outlineBtnText}>Tutti</Text></Pressable>
              <Pressable style={[styles.primarySmall, { flex: 1 }]} onPress={copyDay}><Text style={styles.primarySmallText}>Copia</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  backLink: { color: colors.primary, fontWeight: '700' },
  saveTopBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  saveTopText: { color: '#fff', fontWeight: '700' },
  content: { padding: spacing.md, paddingBottom: 60, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  panelTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase' },
  link: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  titleInput: { fontSize: 22, fontWeight: '800', color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, marginBottom: spacing.sm },
  label: { ...typography.caption, marginTop: spacing.sm, marginBottom: spacing.xs, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  area: { minHeight: 64, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  third: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.primary },
  chipHint: { fontSize: 10, color: colors.textMuted },
  needsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  needCard: { flexGrow: 1, flexBasis: '30%', minWidth: 140, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: radius.md, padding: spacing.sm },
  needCardMain: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  needLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  needValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 4 },
  needInput: { fontSize: 20, fontWeight: '800', color: colors.primary, paddingVertical: 2 },
  needHint: { fontSize: 10, color: colors.textMuted },
  targetLine: { marginTop: spacing.sm, fontWeight: '700', color: colors.primary },
  hint: { ...typography.caption, marginTop: spacing.xs },
  avgText: { fontSize: 12, fontWeight: '700', color: colors.text },
  weekStrip: { flexDirection: 'row', gap: 4, marginBottom: spacing.md },
  dayTab: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: '#f8fafc' },
  dayTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayTabName: { fontSize: 12, fontWeight: '800', color: colors.text },
  dayTabNameActive: { color: '#fff' },
  dayTabKcal: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
  dayHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  dayActions: { flexDirection: 'row', gap: spacing.xs },
  outlineBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 7, alignItems: 'center', backgroundColor: colors.surface },
  outlineBtnText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  primarySmall: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, alignItems: 'center' },
  primarySmallText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  mealCard: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: '#DB2777', borderRadius: radius.md, padding: spacing.sm, backgroundColor: '#fff' },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealIcon: { fontSize: 18 },
  mealTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  mealKcal: { fontSize: 14, fontWeight: '800', color: colors.primary },
  removeIcon: { fontSize: 14, color: colors.danger },
  mealMacros: { ...typography.caption, marginTop: 2, marginBottom: spacing.xs },
  foodRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1f3f7' },
  foodName: { fontWeight: '700', color: colors.text, fontSize: 13 },
  brand: { fontWeight: '500', color: colors.textMuted },
  foodMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  gramBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gramInput: { width: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'right', fontWeight: '700', backgroundColor: '#fff' },
  gramUnit: { fontSize: 12, color: colors.textMuted },
  removeFood: { color: colors.danger, fontWeight: '800', paddingHorizontal: 4 },
  searchInput: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: '#f8fafc' },
  results: { borderWidth: 1, borderColor: colors.border, borderTopWidth: 0, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, backgroundColor: '#fff' },
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#f1f3f7' },
  noResults: { ...typography.caption, padding: spacing.sm },
  quickGrams: { flexDirection: 'row', gap: 4 },
  quickGram: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3 },
  quickGramText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  noteInput: { marginTop: spacing.xs, fontSize: 12, color: colors.text, paddingVertical: 4, minHeight: 28 },
  emptyDay: { marginTop: spacing.md, padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, alignItems: 'center' },
  emptyDayText: { ...typography.caption, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  modalOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalOptionText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
