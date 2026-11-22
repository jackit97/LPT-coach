import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { colors, spacing, radius, statusColors } from '../theme';
import { sportInfo } from '../utils/endurance';

// Piani della libreria assegnati all'atleta (attivi, in arrivo e conclusi).
// kind: 'forza' -> allenamenti non endurance (Pesistica) | 'endurance' -> solo endurance
const STATUS = {
  attivo: { label: 'In corso', color: colors.success },
  futuro: { label: 'In arrivo', color: colors.primary },
  concluso: { label: 'Concluso', color: colors.textMuted },
};
const fmtDay = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '');
const fmtLong = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });

export default function AssignedPlans({ utenteId, kind, isCoach, onOpenWorkout }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    if (!utenteId) { setPlans([]); setLoading(false); return; }
    try {
      const { data } = await api.get('/calendar/assigned-plans', { params: { utenteId } });
      setPlans(data || []);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [utenteId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const matches = (workout) => (kind === 'endurance' ? workout.tipo === 'endurance' : workout.tipo !== 'endurance');
  const list = plans
    .map((plan) => {
      const allenamenti = plan.allenamenti.filter(matches);
      return { ...plan, allenamenti, totale: allenamenti.length, completati: allenamenti.filter((w) => w.stato === 'completato').length };
    })
    .filter((plan) => plan.allenamenti.length > 0);

  const removePlan = (plan) => Alert.alert(
    'Togli piano',
    `Togliere "${plan.nome}" all'atleta? Gli allenamenti non ancora svolti vengono eliminati dal calendario, quelli fatti restano.`,
    [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Togli',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data } = await api.delete(`/calendar/assigned-plans/${plan.assignment_id}`);
            Alert.alert('Piano tolto', data?.message || 'Fatto');
            load();
          } catch (e) {
            Alert.alert('Errore', e?.response?.data?.message || 'Impossibile togliere il piano');
          }
        },
      },
    ],
  );

  if (loading) return <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.primary} />;

  const current = list.filter((plan) => plan.stato !== 'concluso');
  const past = list.filter((plan) => plan.stato === 'concluso');

  const renderPlan = (plan) => {
    const status = STATUS[plan.stato] || STATUS.attivo;
    const expanded = open[plan.assignment_id] ?? plan.stato === 'attivo';
    const pct = plan.totale ? plan.completati / plan.totale : 0;
    const next = plan.allenamenti.find((w) => w.stato !== 'completato' && w.data >= new Date().toISOString().slice(0, 10));
    return (
      <View key={plan.assignment_id} style={[styles.card, plan.stato === 'attivo' && styles.cardActive]}>
        <Pressable onPress={() => setOpen((state) => ({ ...state, [plan.assignment_id]: !expanded }))} style={styles.head}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={2}>{plan.nome}</Text>
              <Text style={[styles.badge, { color: status.color, borderColor: status.color }]}>{status.label}</Text>
            </View>
            <Text style={styles.meta}>
              {fmtDay(plan.data_inizio)} → {fmtDay(plan.data_fine)} · {plan.settimane} settiman{plan.settimane === 1 ? 'a' : 'e'} · {plan.completati}/{plan.totale} fatti
            </Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} /></View>
            {!!next && !expanded && <Text style={styles.next}>Prossimo: {fmtLong(next.data)} · {next.titolo}</Text>}
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Pressable>
        {expanded && (
          <View style={styles.list}>
            {!!plan.descrizione && <Text style={styles.desc}>{plan.descrizione}</Text>}
            {plan.allenamenti.map((workout) => {
              const sport = sportInfo(workout.sport);
              const done = workout.stato === 'completato';
              return (
                <Pressable key={workout.workout_id} style={styles.row} onPress={() => onOpenWorkout?.(workout.workout_id)}>
                  <Ionicons name={done ? 'checkmark-circle' : workout.stato === 'saltato' ? 'close-circle' : 'ellipse-outline'} size={18} color={statusColors[workout.stato] || colors.textMuted} />
                  <Text style={styles.rowDate}>{fmtLong(workout.data)}</Text>
                  <Text style={[styles.rowTitle, done && { color: colors.textMuted }]} numberOfLines={1}>{sport ? `${sport.icon} ` : ''}{workout.titolo}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              );
            })}
            {isCoach && (
              <Pressable style={styles.remove} onPress={() => removePlan(plan)}>
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={styles.removeText}>Togli piano all'atleta</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View>
      <Text style={styles.section}>Piani assegnati</Text>
      {current.length ? current.map(renderPlan) : (
        <Text style={styles.empty}>{isCoach ? 'Nessun piano in corso: assegnalo da Libreria → Piani.' : 'Nessun piano in corso.'}</Text>
      )}
      {past.length > 0 && (
        <>
          <Pressable style={styles.pastToggle} onPress={() => setShowPast((value) => !value)}>
            <Text style={[styles.section, { marginTop: 0, flex: 1 }]}>Piani conclusi ({past.length})</Text>
            <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </Pressable>
          {showPast && past.map(renderPlan)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  pastToggle: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardActive: { borderColor: colors.primary, borderWidth: 1.5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  badge: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginTop: 6 },
  fill: { height: 6, backgroundColor: colors.success },
  next: { fontSize: 12, color: colors.text, marginTop: 6, fontWeight: '600' },
  list: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  desc: { fontSize: 13, color: colors.textMuted, marginVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  rowDate: { width: 86, fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: 6 },
  removeText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
});
