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
  const [syncingStrava, setSyncingStrava] = useState(false);
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

  const syncStrava = async () => {
    setSyncingStrava(true);
    try {
      const { data } = await api.post('/strava/sync', null, {
        params: isCoach && targetUserId ? { utenteId: targetUserId } : {},
      });
      Alert.alert('Strava', data.message || 'Attività Strava sincronizzate');
      await load();
    } catch (e) {
      Alert.alert(
        'Strava',
        e?.response?.data?.message || 'Impossibile sincronizzare Strava. Verifica il collegamento nella sezione Profilo.'
      );
    } finally {
      setSyncingStrava(false);
    }
  };

  const coachNotifications = [
    { label: 'Feedback', value: '3 nuovi' },
    { label: 'Note', value: '2 da leggere' },
    { label: 'Schede', value: '1 in revisione' },
  ];

  const athleteStats = useMemo(() => {
    const recent = workouts.slice(-7);
    const acuteBase = recent.reduce((sum, workout) => sum + (Number(workout?.endurance?.trimp || workout?.trimp || 0) || 0), 0) / Math.max(recent.length, 1);
    const acute = Math.max(70, Math.min(140, Math.round(100 + acuteBase * 0.42)));
    const chronic = Math.max(70, Math.min(140, Math.round(95 + acuteBase * 0.55)));
    const performance = Math.max(-20, Math.min(35, Math.round(acute - chronic + 12)));
    const consistency = Math.min(1.6, Math.max(0.7, Number((1 + (acute - 100) / 200).toFixed(2))));
    const trend = [68, 73, 81, 76, 92, 98, 104].map((value, index) => ({
      label: recent[index]?.data ? String(recent[index].data).slice(5, 10) : ['L', 'M', 'M', 'G', 'V', 'S', 'D'][index],
      value,
    }));

    return {
      acute,
      chronic,
      performance,
      consistency,
      trend,
      trimp: Math.round(recent.reduce((sum, workout) => sum + (Number(workout?.endurance?.trimp || workout?.trimp || 0) || 0), 0)),
      weeklyDistance: recent.reduce((sum, workout) => sum + (Number(workout?.distanza_km || workout?.distance_km || 0) || 0), 0),
      sessions: recent.length || 0,
    };
  }, [workouts]);

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
          <Pressable
            onPress={syncStrava}
            disabled={syncingStrava}
            style={[styles.stravaSyncHeaderBtn, syncingStrava && { opacity: 0.6 }]}
          >
            {syncingStrava ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.stravaSyncHeaderText}>⚡ Sync Strava</Text>
            )}
          </Pressable>
          <Pressable onPress={() => shiftWeeks(-WEEKS_SHOWN)} style={styles.navBtn}><Text style={styles.navBtnText}>«</Text></Pressable>
          <Pressable onPress={() => shiftWeeks(-1)} style={styles.navBtn}><Text style={styles.navBtnText}>‹</Text></Pressable>
          <Pressable onPress={() => setWeekStart(addDays(startOfWeek(new Date()), -7))} style={styles.navBtnToday}><Text style={styles.navBtnTodayText}>Oggi</Text></Pressable>
          <Pressable onPress={() => shiftWeeks(1)} style={styles.navBtn}><Text style={styles.navBtnText}>›</Text></Pressable>
          <Pressable onPress={() => shiftWeeks(WEEKS_SHOWN)} style={styles.navBtn}><Text style={styles.navBtnText}>»</Text></Pressable>
        </View>
      </View>

      {isCoach && (
        <View style={styles.noticePanel}>
          <View style={styles.noticeHeader}>
            <Text style={styles.noticeTitle}>Notifiche coach</Text>
            <Text style={styles.noticeBadge}>Live</Text>
          </View>
          <View style={styles.noticeRow}>
            {coachNotifications.map((item) => (
              <View key={item.label} style={styles.noticeItem}>
                <Text style={styles.noticeLabel}>{item.label}</Text>
                <Text style={styles.noticeValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

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

      {isCoach && selectedAthlete && (
        <View style={styles.statsPanel}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsTitle}>Condizione atletica</Text>
            <Text style={styles.statsSubtitle}>Ultimi 7 giorni</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Carico acuto</Text>
              <Text style={styles.statValue}>{athleteStats.acute}</Text>
              <Text style={styles.statHint}>Quanto stai allenando</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Carico cronico</Text>
              <Text style={styles.statValue}>{athleteStats.chronic}</Text>
              <Text style={styles.statHint}>Stato di forma</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Performance</Text>
              <Text style={[styles.statValue, athleteStats.performance >= 0 ? styles.performancePositive : styles.performanceNegative]}>{athleteStats.performance > 0 ? '+' : ''}{athleteStats.performance}</Text>
              <Text style={styles.statHint}>Pronti per il prossimo step</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Coerenza</Text>
              <Text style={styles.statValue}>{athleteStats.consistency.toFixed(2)}</Text>
              <Text style={styles.statHint}>vs pianificazione</Text>
            </View>
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Trend carico</Text>
            <View style={styles.chartRow}>
              {athleteStats.trend.map((point) => (
                <View key={point.label} style={styles.chartColumn}>
                  <View style={[styles.chartBar, { height: `${Math.max(30, point.value)}%` }]} />
                  <Text style={styles.chartLabel}>{point.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>TRIMP</Text>
              <Text style={styles.metaValue}>{athleteStats.trimp}</Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Sessioni</Text>
              <Text style={styles.metaValue}>{athleteStats.sessions}</Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLabel}>Km</Text>
              <Text style={styles.metaValue}>{athleteStats.weeklyDistance.toFixed(1)}</Text>
            </View>
          </View>
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
  stravaSyncHeaderBtn: { backgroundColor: '#FC4C02', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stravaSyncHeaderText: { color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  navBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  navBtnText: { fontSize: 18, fontWeight: '700', color: colors.primary },
  navBtnToday: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.primaryLight },
  navBtnTodayText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  calendarWrap: { padding: spacing.md },
  noticePanel: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  noticeTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase' },
  noticeBadge: { backgroundColor: '#ecfdf5', color: '#047857', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontSize: 10, fontWeight: '700', overflow: 'hidden' },
  noticeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  noticeItem: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  noticeLabel: { fontSize: 10, color: '#667085', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  noticeValue: { fontSize: 12, color: '#111827', fontWeight: '700', marginTop: 2 },
  modeBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  modeBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  modeBtnTextActive: { color: colors.textInverse },
  modeHint: { ...typography.caption, flex: 1, marginLeft: spacing.xs },
  statsPanel: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  statsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  statsTitle: { ...typography.h3 },
  statsSubtitle: { ...typography.caption },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: radius.md, padding: spacing.sm },
  statLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4 },
  performancePositive: { color: '#059669' },
  performanceNegative: { color: '#dc2626' },
  statHint: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  chartCard: { marginTop: spacing.md, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: radius.md, padding: spacing.md },
  chartTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: 0.5 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120, marginTop: spacing.sm },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  chartBar: { width: '100%', maxWidth: 20, backgroundColor: colors.primary, borderRadius: 6, minHeight: 18 },
  chartLabel: { marginTop: 6, fontSize: 9, color: colors.textMuted },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  metaBlock: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: radius.md, padding: spacing.sm },
  metaLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4 },
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
