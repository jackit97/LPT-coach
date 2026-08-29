import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import MonthCalendarGrid from '../components/MonthCalendarGrid';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

function monthRange(year, month) {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function CalendarScreen({ navigation }) {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();

  const [cursor, setCursor] = useState(() => new Date());
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const load = useCallback(async () => {
    if (!targetUserId) {
      setWorkouts([]);
      setLoading(false);
      return;
    }
    const { from, to } = monthRange(year, month);
    try {
      const { data } = await api.get('/calendar', { params: { utenteId: targetUserId, from, to } });
      setWorkouts(data || []);
    } catch (e) {
      // keep silent, show empty calendar
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetUserId, year, month]);

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

  const goToDetail = (workout) => navigation.navigate('WorkoutDetail', { workoutId: workout.workout_id });

  const onDayPress = (iso, dayWorkouts) => {
    if (dayWorkouts.length === 1) {
      goToDetail(dayWorkouts[0]);
    } else if (dayWorkouts.length > 1) {
      navigation.navigate('DayWorkouts', { date: iso, workouts: dayWorkouts });
    } else if (isCoach && targetUserId) {
      navigation.navigate('WorkoutEditor', { date: iso, utenteId: targetUserId });
    }
  };

  const changeMonth = (delta) => setCursor(new Date(year, month + delta, 1));

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
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{isCoach ? selectedAthlete?.nome : 'Il mio calendario'}</Text>
          <Text style={styles.headerSubtitle}>{MONTH_NAMES[month]} {year}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => changeMonth(-1)} style={styles.navBtn}><Text style={styles.navBtnText}>‹</Text></Pressable>
          <Pressable onPress={() => setCursor(new Date())} style={styles.navBtnToday}><Text style={styles.navBtnTodayText}>Oggi</Text></Pressable>
          <Pressable onPress={() => changeMonth(1)} style={styles.navBtn}><Text style={styles.navBtnText}>›</Text></Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={styles.calendarWrap}
        >
          <MonthCalendarGrid
            year={year}
            month={month}
            workoutsByDate={workoutsByDate}
            onDayPress={onDayPress}
            onWorkoutPress={goToDetail}
          />
        </ScrollView>
      )}

      {isCoach && targetUserId && (
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate('WorkoutEditor', { date: new Date().toISOString().slice(0, 10), utenteId: targetUserId })}
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
