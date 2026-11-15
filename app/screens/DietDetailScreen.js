import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import MacroSummary, { MacroSplitBar } from '../components/MacroSummary';
import { colors, spacing, radius, typography } from '../theme';
import { WEEK_DAYS, MEAL_TYPES, MEAL_ICONS, EMPTY_MACROS, addMacros, mealMacros, foodMacros, parseMealFoods, dayShort, toNumber } from '../utils/nutrition';

const fmtDate = (value) => (value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const escapeHtml = (text) => String(text ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const todayDay = () => WEEK_DAYS[(new Date().getDay() + 6) % 7];

export default function DietDetailScreen({ route, navigation }) {
  const { dietId } = route.params;
  const { isCoach } = useAuth();
  const [diet, setDiet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(todayDay());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/diets/${dietId}`);
      setDiet(data);
      // Mostra oggi se ha pasti, altrimenti il primo giorno pianificato
      const days = (data.pasti || []).map((pasto) => pasto.giorno_settimana || 'Lunedi');
      if (days.length && !days.includes(todayDay())) setActiveDay(WEEK_DAYS.find((day) => days.includes(day)));
    } catch {
      Alert.alert('Errore', 'Impossibile caricare la dieta');
    } finally {
      setLoading(false);
    }
  }, [dietId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const meals = useMemo(() => (diet?.pasti || []).map((pasto) => {
    const parsed = parseMealFoods(pasto);
    return { ...pasto, giorno_settimana: pasto.giorno_settimana || 'Lunedi', manuale: parsed.manuale, alimenti: parsed.alimenti };
  }), [diet]);
  const target = useMemo(() => {
    if (!diet?.fabbisogno_json) return null;
    try { return JSON.parse(diet.fabbisogno_json).target || null; } catch { return null; }
  }, [diet]);
  const dayTotals = useMemo(() => Object.fromEntries(WEEK_DAYS.map((day) => [
    day, meals.filter((meal) => meal.giorno_settimana === day).reduce((total, meal) => addMacros(total, mealMacros(meal)), EMPTY_MACROS),
  ])), [meals]);
  const hasStructured = meals.some((meal) => meal.alimenti.length);
  const plannedDays = WEEK_DAYS.filter((day) => meals.some((meal) => meal.giorno_settimana === day));

  const downloadPdf = () => {
    if (typeof window === 'undefined' || !window.open) return Alert.alert('PDF', 'L\'esportazione PDF è disponibile dalla versione web.');
    const sections = plannedDays.map((day) => {
      const rows = meals.filter((meal) => meal.giorno_settimana === day)
        .sort((a, b) => MEAL_TYPES.indexOf(a.tipopasto) - MEAL_TYPES.indexOf(b.tipopasto))
        .map((meal) => {
          const foods = meal.alimenti.length
            ? `<ul>${meal.alimenti.map((item) => `<li>${escapeHtml(item.food.product_name)} — <b>${toNumber(item.grams)} g</b> <small>(${Math.round(foodMacros(item).kcal)} kcal)</small></li>`).join('')}</ul>`
            : '';
          const totals = mealMacros(meal);
          return `<tr><th>${escapeHtml(meal.tipopasto)}${meal.alimenti.length ? `<br><small>${Math.round(totals.kcal)} kcal</small>` : ''}</th><td>${foods}${meal.manuale ? `<p>${escapeHtml(meal.manuale).replace(/\n/g, '<br>')}</p>` : ''}</td></tr>`;
        }).join('');
      const t = dayTotals[day];
      return `<h2>${day}${hasStructured ? ` <small>${Math.round(t.kcal)} kcal · P ${Math.round(t.proteins)} g · C ${Math.round(t.carbs)} g · G ${Math.round(t.fat)} g</small>` : ''}</h2><table><tbody>${rows}</tbody></table>`;
    }).join('');
    const popup = window.open('', '_blank');
    if (!popup) return Alert.alert('PDF', 'Consenti le finestre popup per creare il PDF.');
    popup.document.write(`<html><head><title>${escapeHtml(diet.nome || 'Dieta')}</title><style>body{font-family:Arial;padding:24px;color:#18212b}h1{margin:0 0 4px;color:#0B3D91}h2{font-size:16px;margin:22px 0 6px;color:#0B3D91}h2 small{font-weight:normal;color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}th{background:#eef1f6;width:130px}ul{margin:0;padding-left:18px}p{margin:6px 0 0;color:#475467}small{color:#64748b}.note{margin-top:8px;color:#475467}</style></head><body><h1>${escapeHtml(diet.nome || 'Dieta')}</h1><small>${fmtDate(diet.datainizio)} – ${fmtDate(diet.datafine)}${target ? ` · Obiettivo ${target.kcal} kcal/giorno` : ''}</small>${diet.notegenerali ? `<div class="note">${escapeHtml(diet.notegenerali).replace(/\n/g, '<br>')}</div>` : ''}${sections}</body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  };

  const deleteDiet = () => {
    Alert.alert('Elimina dieta', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => { try { await api.delete(`/diets/${dietId}`); navigation.goBack(); } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile eliminare la dieta'); } } },
    ]);
  };

  if (loading || !diet) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  const today = new Date().toISOString().slice(0, 10);
  const expired = diet.datafine && String(diet.datafine).slice(0, 10) < today;
  const dayMeals = meals.filter((meal) => meal.giorno_settimana === activeDay).sort((a, b) => MEAL_TYPES.indexOf(a.tipopasto) - MEAL_TYPES.indexOf(b.tipopasto));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{diet.nome || 'Dieta'}</Text>
          <Text style={[styles.status, expired ? styles.statusExpired : styles.statusActive]}>{expired ? 'Scaduta' : 'Attiva'}</Text>
        </View>
        <Text style={typography.caption}>{fmtDate(diet.datainizio)} → {fmtDate(diet.datafine)}{target ? ` · Obiettivo ${target.kcal} kcal/giorno` : ''}</Text>
        {!!diet.notegenerali && <Text style={styles.paragraph}>{diet.notegenerali}</Text>}
        <View style={styles.actionsRow}>
          <Pressable style={styles.outlineBtn} onPress={downloadPdf}><Text style={styles.outlineBtnText}>⇩ Scarica PDF</Text></Pressable>
          {isCoach && <Pressable style={styles.outlineBtn} onPress={() => navigation.navigate('DietEditor', { dietId })}><Text style={styles.outlineBtnText}>✎ Modifica</Text></Pressable>}
          {isCoach && <Pressable style={[styles.outlineBtn, styles.dangerBtn]} onPress={deleteDiet}><Text style={[styles.outlineBtnText, { color: colors.danger }]}>Elimina</Text></Pressable>}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Piano settimanale</Text>
        <View style={styles.weekStrip}>
          {WEEK_DAYS.map((day) => (
            <Pressable key={day} style={[styles.dayTab, activeDay === day && styles.dayTabActive]} onPress={() => setActiveDay(day)}>
              <Text style={[styles.dayTabName, activeDay === day && styles.dayTabNameActive]}>{dayShort(day)}</Text>
              {hasStructured && <Text style={[styles.dayTabKcal, activeDay === day && styles.dayTabNameActive]}>{Math.round(dayTotals[day].kcal) || '—'}</Text>}
            </Pressable>
          ))}
        </View>

        {hasStructured && (
          <>
            <MacroSummary macros={dayTotals[activeDay]} target={target} />
            <View style={{ marginTop: spacing.sm }}><MacroSplitBar macros={dayTotals[activeDay]} /></View>
          </>
        )}

        {dayMeals.map((meal) => {
          const totals = mealMacros(meal);
          return (
            <View key={meal.pastoid} style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealIcon}>{MEAL_ICONS[meal.tipopasto] || '🍽'}</Text>
                <Text style={styles.mealTitle}>{meal.tipopasto}</Text>
                {meal.alimenti.length > 0 && <Text style={styles.mealKcal}>{Math.round(totals.kcal)} kcal</Text>}
              </View>
              {meal.alimenti.map((item, index) => (
                <View key={index} style={styles.foodRow}>
                  <Text style={styles.foodName} numberOfLines={2}>{item.food.product_name}</Text>
                  <Text style={styles.foodGrams}>{toNumber(item.grams)} g</Text>
                  <Text style={styles.foodKcal}>{Math.round(foodMacros(item).kcal)} kcal</Text>
                </View>
              ))}
              {!!meal.manuale && <Text style={styles.mealNote}>{meal.manuale}</Text>}
              {meal.alimenti.length > 0 && <Text style={styles.mealMacros}>P {Math.round(totals.proteins)} g · C {Math.round(totals.carbs)} g · G {Math.round(totals.fat)} g</Text>}
            </View>
          );
        })}
        {!dayMeals.length && <Text style={styles.empty}>Nessun pasto previsto per {activeDay}.</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 60, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  panelTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { ...typography.h1, flexShrink: 1 },
  status: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  statusActive: { backgroundColor: '#ecfdf5', color: '#047857' },
  statusExpired: { backgroundColor: '#fef2f2', color: colors.danger },
  paragraph: { ...typography.body, marginTop: spacing.sm, lineHeight: 20 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  outlineBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface },
  outlineBtnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  dangerBtn: { borderColor: '#fecaca' },
  weekStrip: { flexDirection: 'row', gap: 4, marginBottom: spacing.md },
  dayTab: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: '#f8fafc' },
  dayTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayTabName: { fontSize: 12, fontWeight: '800', color: colors.text },
  dayTabNameActive: { color: '#fff' },
  dayTabKcal: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginTop: 2 },
  mealCard: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: '#DB2777', borderRadius: radius.md, padding: spacing.sm },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  mealIcon: { fontSize: 18 },
  mealTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  mealKcal: { fontSize: 14, fontWeight: '800', color: colors.primary },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#f1f3f7' },
  foodName: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '600' },
  foodGrams: { width: 60, textAlign: 'right', fontWeight: '800', color: colors.text },
  foodKcal: { width: 70, textAlign: 'right', fontSize: 12, color: colors.textMuted },
  mealNote: { ...typography.caption, marginTop: 4, fontStyle: 'italic' },
  mealMacros: { fontSize: 11, color: colors.textMuted, marginTop: 4, fontWeight: '700' },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.lg },
});
