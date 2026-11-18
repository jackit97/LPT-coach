import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import MonthCalendarGrid from '../components/MonthCalendarGrid';
import AthletePicker from '../components/AthletePicker';
import LoadChart from '../components/LoadChart';
import { colors, spacing, radius, typography } from '../theme';
import { toISODate, startOfWeek, addDays } from '../utils/dates';
import { performanceStatus, formatShortDuration } from '../utils/endurance';

const ALERT_ICONS = { inattivita: '⏸', aderenza: '📉', carico: '⚠', commenti: '💬' };
const PRIORITY_COLORS = { alta: '#dc2626', media: '#d97706', bassa: '#64748b' };

const WEEKS_SHOWN = 5;
const EVENT_TYPES = ['dieta', 'scadenza_dieta', 'scheda', 'scadenza_scheda', 'pagamento'];

const fmtDay = (d) => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

export default function CalendarScreen({ navigation }) {
  const { isCoach, enduranceEnabled, profileComplete } = useAuth();
  const { selectedAthlete, targetUserId, clients, setSelectedAthlete } = useAthlete();

  const [weekStart, setWeekStart] = useState(() => addDays(startOfWeek(new Date()), -7));
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingStrava, setSyncingStrava] = useState(false);
  const [mode, setMode] = useState('normal'); // normal | move | copy
  const [selected, setSelected] = useState(null);
  const [loadData, setLoadData] = useState(null);
  const [assistant, setAssistant] = useState(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [statsOpen, setStatsOpen] = useState(true);
  const [loadError, setLoadError] = useState(null);

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
      setLoadError(null);
    } catch (e) {
      setLoadError(e?.response?.data?.detail || e?.response?.data?.message || 'Impossibile caricare il calendario.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetUserId, fromISO, toISO, enduranceEnabled]);

  // Carico acuto/cronico/performance: ultime 8 settimane + 2 di proiezione sul pianificato
  const loadTrainingLoad = useCallback(async () => {
    if (!targetUserId || !enduranceEnabled) { setLoadData(null); return; }
    const today = new Date();
    try {
      const { data } = await api.get('/endurance/load', {
        params: { utenteId: targetUserId, from: toISODate(addDays(today, -55)), to: toISODate(addDays(today, 14)) },
      });
      setLoadData(data);
    } catch {
      setLoadData(null);
    }
  }, [targetUserId, enduranceEnabled]);

  const loadAssistant = useCallback(async () => {
    if (!isCoach) return;
    try {
      const { data } = await api.get('/pt/alerts');
      setAssistant(data);
    } catch {
      setAssistant(null);
    }
  }, [isCoach]);

  useFocusEffect(useCallback(() => { load(); loadTrainingLoad(); }, [load, loadTrainingLoad]));
  useFocusEffect(useCallback(() => { loadAssistant(); }, [loadAssistant]));

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

  const condition = useMemo(() => {
    if (!loadData?.current) return null;
    const mondayISO = toISODate(startOfWeek(new Date()));
    const week = (loadData.weeks || []).find((item) => item.settimana === mondayISO);
    const adherence = week && week.secondi_pianificati > 0 ? Math.round((week.secondi_eseguiti / week.secondi_pianificati) * 100) : null;
    const ratio = loadData.current.cronico > 1 ? loadData.current.acuto / loadData.current.cronico : null;
    return { ...loadData.current, week, adherence, ratio, status: performanceStatus(loadData.current.performance) };
  }, [loadData]);

  const athletesWithAlerts = (assistant?.athletes || []).filter((athlete) => athlete.alerts.length);
  const visibleAlerts = showAllAlerts ? athletesWithAlerts : athletesWithAlerts.slice(0, 3);
  const openAthlete = (athleteId) => {
    const client = clients.find((item) => item.utenteid === athleteId);
    if (client) setSelectedAthlete(client);
  };

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
      {!!loadError && (
        <Pressable style={styles.profileWarning} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.profileWarningText}>Errore nel caricamento: {loadError} · Tocca per riprovare</Text>
        </Pressable>
      )}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{isCoach ? selectedAthlete?.nome : 'Il mio calendario'}</Text>
          <Text style={styles.headerSubtitle}>{fmtDay(weekStart)} – {fmtDay(rangeEnd)} {rangeEnd.getFullYear()}</Text>
        </View>
        <View style={styles.headerActions}>
          {!isCoach && (
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
          )}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); loadTrainingLoad(); loadAssistant(); }} />}
          contentContainerStyle={styles.calendarWrap}
        >
          {isCoach && assistant && (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Coach Assistant</Text>
                <Text style={[styles.panelBadge, !athletesWithAlerts.length && styles.panelBadgeOk]}>
                  {athletesWithAlerts.length ? `${athletesWithAlerts.length} atleti da seguire` : 'Tutto in ordine'}
                </Text>
              </View>
              {visibleAlerts.map((athlete) => (
                <Pressable key={athlete.utenteid} style={[styles.alertRow, athlete.utenteid === targetUserId && styles.alertRowActive]} onPress={() => openAthlete(athlete.utenteid)}>
                  <Text style={styles.alertName} numberOfLines={1}>{athlete.nome}</Text>
                  <View style={styles.alertChips}>
                    {athlete.alerts.map((alert) => (
                      <Text key={alert.type} style={[styles.alertChip, { color: PRIORITY_COLORS[alert.priority], borderColor: PRIORITY_COLORS[alert.priority] }]} numberOfLines={1}>
                        {ALERT_ICONS[alert.type]} {alert.message}
                      </Text>
                    ))}
                  </View>
                </Pressable>
              ))}
              {athletesWithAlerts.length > 3 && (
                <Pressable onPress={() => setShowAllAlerts((value) => !value)}>
                  <Text style={styles.linkText}>{showAllAlerts ? 'Mostra meno' : `Mostra tutti (${athletesWithAlerts.length})`}</Text>
                </Pressable>
              )}
            </View>
          )}

          {enduranceEnabled && condition && (
            <View style={styles.panel}>
              <Pressable style={styles.panelHeader} onPress={() => setStatsOpen((value) => !value)}>
                <Text style={styles.panelTitle}>Condizione atletica</Text>
                <Text style={styles.linkText}>{statsOpen ? 'Nascondi ▴' : 'Mostra ▾'}</Text>
              </Pressable>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Carico acuto</Text>
                  <Text style={[styles.statValue, { color: '#2563eb' }]}>{Math.round(condition.acuto)}</Text>
                  <Text style={styles.statHint}>Quanto si sta allenando (7 gg)</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Carico cronico</Text>
                  <Text style={[styles.statValue, { color: '#c026d3' }]}>{Math.round(condition.cronico)}</Text>
                  <Text style={styles.statHint}>Condizione di forma (42 gg)</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Performance</Text>
                  <Text style={[styles.statValue, { color: condition.status.color }]}>{condition.performance > 0 ? '+' : ''}{Math.round(condition.performance)}</Text>
                  <Text style={styles.statHint}>{condition.status.label}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Settimana</Text>
                  <Text style={styles.statValue}>{condition.adherence !== null ? `${condition.adherence}%` : '—'}</Text>
                  <Text style={styles.statHint}>
                    {condition.week ? `${formatShortDuration(condition.week.secondi_eseguiti)} di ${formatShortDuration(condition.week.secondi_pianificati)} · ${condition.week.trimp_eseguito} TRIMP` : 'Nessun allenamento'}
                  </Text>
                </View>
              </View>
              {statsOpen && (
                <View style={styles.chartWrap}>
                  <LoadChart series={loadData.series || []} />
                  {condition.ratio !== null && (condition.ratio > 1.5 || condition.ratio < 0.5) && (
                    <Text style={styles.ratioWarning}>
                      Rapporto acuto/cronico {condition.ratio.toFixed(2)}: {condition.ratio > 1.5 ? 'aumento di carico troppo rapido' : 'carico in forte calo'}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

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
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  stravaSyncHeaderBtn: { backgroundColor: '#FC4C02', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stravaSyncHeaderText: { color: '#ffffff', fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
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
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  panelTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase' },
  panelBadge: { backgroundColor: '#fef3c7', color: '#92400e', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontSize: 10, fontWeight: '700', overflow: 'hidden' },
  panelBadgeOk: { backgroundColor: '#ecfdf5', color: '#047857' },
  alertRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  alertRowActive: { backgroundColor: colors.primaryLight, marginHorizontal: -spacing.md, paddingHorizontal: spacing.md },
  alertName: { fontSize: 13, fontWeight: '800', color: colors.text },
  alertChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  alertChip: { fontSize: 10, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '100%' },
  linkText: { color: colors.accent, fontSize: 12, fontWeight: '700', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { flexBasis: '22%', minWidth: 140, flexGrow: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: radius.md, padding: spacing.sm },
  statLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4 },
  statHint: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  chartWrap: { marginTop: spacing.md },
  ratioWarning: { marginTop: spacing.xs, color: colors.danger, fontSize: 11, fontWeight: '700' },
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
