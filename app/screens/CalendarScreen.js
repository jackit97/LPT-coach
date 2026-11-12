import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import MonthCalendarGrid from '../components/MonthCalendarGrid';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';
import { toISODate, startOfWeek, addDays } from '../utils/dates';

const WEEKS_SHOWN = 5;
const EVENT_TYPES = ['dieta', 'scadenza_dieta', 'scheda', 'scadenza_scheda', 'pagamento'];

const fmtDay = (d) => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

export default function CalendarScreen({ navigation }) {
  const { isCoach, enduranceEnabled, profileComplete } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();

  const [weekStart, setWeekStart] = useState(() => addDays(startOfWeek(new Date()), -7));
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState('normal'); // normal | move | copy
  const [selected, setSelected] = useState(null);

  const rangeEnd = addDays(weekStart, WEEKS_SHOWN * 7 - 1);
  const fromISO = toISODate(weekStart);
  const toISO = toISODate(rangeEnd);

  const load = useCallback(async () => {
    if (!targetUserId) {
      setWorkouts([]);
      setLoading(false);
      return;
    }
    const from = fromISO;
    const to = toISO;
    try {
      const { data } = await api.get('/calendar', { params: { utenteId: targetUserId, from, to } });
      setWorkouts(enduranceEnabled ? (data || []) : (data || []).filter((w) => w.tipo !== 'endurance'));
    } catch (e) {
      // keep silent, show empty calendar
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetUserId, fromISO, toISO, enduranceEnabled]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const workoutsByDate = useMemo(() => {
    const map = {};
    for (const w of workouts) {
      const iso = String(w.data).slice(0, 10);
      if (!map[iso]) map[iso] = [];
      map[iso].push(w);
    }
    return map;
  }, [workouts]);

  const goToDetail = (workout) => {
    if (EVENT_TYPES.includes(workout.tipo)) {
      Alert.alert(workout.titolo, workout.descrizione || 'Evento calendario');
      return;
    }
    navigation.navigate('WorkoutDetail', { workoutId: workout.workout_id });
  };

  const setModeAndReset = (next) => { setMode(next); setSelected(null); };

  const onWorkoutPress = (workout) => {
    if (isCoach && mode !== 'normal') {
      if (EVENT_TYPES.includes(workout.tipo)) return;
      setSelected(workout);
      return;
    }
    goToDetail(workout);
  };

  const dropSelected = async (iso) => {
    if (!selected) return;
    try {
      if (mode === 'move') await api.put(`/calendar/${selected.workout_id}`, { data: iso });
      else await api.post(`/workouts/duplicate/${selected.workout_id}`, { data: iso });
      setSelected(null);
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Operazione non riuscita');
    }
  };

  const onDayPress = (iso, dayWorkouts) => {
    if (isCoach && mode !== 'normal') {
      dropSelected(iso);
      return;
    }
    if (dayWorkouts.length === 1) {
      goToDetail(dayWorkouts[0]);
    } else if (dayWorkouts.length > 1) {
      navigation.navigate('DayWorkouts', { date: iso, workouts: dayWorkouts });
    } else if (isCoach && targetUserId) {
      navigation.navigate('NewActivity', { date: iso, utenteId: targetUserId });
    }
  };

  const shiftWeeks = (n) => setWeekStart((current) => addDays(current, n * 7));

  if (isCoach && !selectedAthlete) {
    return (
      <View style={styles.center}>
        <Text style={typography.h2}>Seleziona un atleta</Text>
        <View style={{ height: spacing.md }} />
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Clients')}>
          <Text style={styles.primaryButtonText}>Vai ai tuoi atleti</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isCoach && <AthletePicker />}
      {!isCoach && !profileComplete && (
        <Pressable style={styles.profileWarning} onPress={() => navigation.navigate('Profile')}>
          <Text style={styles.profileWarningText}>Completa il tuo profilo per essere aggiunto tra gli atleti del coach. Tocca qui.</Text>
        </Pressable>
      )}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{isCoach ? selectedAthlete?.nome : 'Il mio calendario'}</Text>
          <Text style={styles.headerSubtitle}>{fmtDay(weekStart)} – {fmtDay(rangeEnd)} {rangeEnd.getFullYear()}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => shiftWeeks(-WEEKS_SHOWN)} style={styles.navBtn}><Text style={styles.navBtnText}>«</Text></Pressable>
          <Pressable onPress={() => shiftWeeks(-1)} style={styles.navBtn}><Text style={styles.navBtnText}>‹</Text></Pressable>
          <Pressable onPress={() => setWeekStart(addDays(startOfWeek(new Date()), -7))} style={styles.navBtnToday}><Text style={styles.navBtnTodayText}>Oggi</Text></Pressable>
          <Pressable onPress={() => shiftWeeks(1)} style={styles.navBtn}><Text style={styles.navBtnText}>›</Text></Pressable>
          <Pressable onPress={() => shiftWeeks(WEEKS_SHOWN)} style={styles.navBtn}><Text style={styles.navBtnText}>»</Text></Pressable>
        </View>
      </View>

      {isCoach && (
        <View style={styles.modeBar}>
          {[['normal', 'Normale'], ['move', 'Sposta'], ['copy', 'Duplica']].map(([key, label]) => (
            <Pressable key={key} onPress={() => setModeAndReset(key)} style={[styles.modeBtn, mode === key && styles.modeBtnActive]}>
              <Text style={[styles.modeBtnText, mode === key && styles.modeBtnTextActive]}>{label}</Text>
            </Pressable>
          ))}
          {mode !== 'normal' && (
            <Text style={styles.modeHint} numberOfLines={1}>
              {selected ? `Tocca il giorno di destinazione per "${selected.titolo}"` : 'Seleziona un allenamento'}
            </Text>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={styles.calendarWrap}
        >
          <MonthCalendarGrid
            startDate={weekStart}
            weeks={WEEKS_SHOWN}
            workoutsByDate={workoutsByDate}
            onDayPress={onDayPress}
            onWorkoutPress={onWorkoutPress}
            selectedWorkoutId={selected?.workout_id}
          />
        </ScrollView>
      )}

      {isCoach && targetUserId && (
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate('NewActivity', { date: toISODate(new Date()), utenteId: targetUserId })}
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  profileWarning: { backgroundColor: '#FEF3C7', borderBottomWidth: 1, borderBottomColor: '#F59E0B', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  profileWarningText: { color: '#92400E', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h2 },
  headerSubtitle: { ...typography.caption, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  navBtnText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  navBtnToday: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primaryLight },
  navBtnTodayText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  calendarWrap: { padding: spacing.md },
  modeBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  modeBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  modeBtnTextActive: { color: colors.textInverse },
  modeHint: { ...typography.caption, flex: 1, marginLeft: spacing.xs },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: colors.textInverse, fontSize: 28, fontWeight: '700', marginTop: -2 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
});
