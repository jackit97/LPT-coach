import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius } from '../theme';
import WorkoutBadge from './WorkoutBadge';
import { weekSummary } from './MonthCalendarGrid';
import { toISODate, addDays, isoWeekNumber } from '../utils/dates';
import { formatShortDuration } from '../utils/endurance';

// Vista "elenco" del calendario: i giorni uno sotto l'altro, raggruppati per settimana,
// con gli allenamenti a tutta larghezza (piu' leggibile sul telefono della griglia a 7 colonne).
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function Stat({ label, done, planned }) {
  if (!done && !planned) return null;
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{done || '0'}{planned ? <Text style={styles.statPlanned}> / {planned}</Text> : null}</Text>
    </View>
  );
}

export default function CalendarAgenda({ startDate, weeks = 5, workoutsByDate, onDayPress, onWorkoutPress, selectedWorkoutId, onTodayLayout, emptyLabel }) {
  const rows = useMemo(
    () => Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(startDate, w * 7 + d))),
    [startDate, weeks],
  );
  const todayISO = toISODate(new Date());
  // posizione di oggi = y della sua settimana + y del giorno nella settimana (gli onLayout arrivano in ordine sparso)
  const [todayWeekY, setTodayWeekY] = useState(null);
  const [todayDayY, setTodayDayY] = useState(null);
  useEffect(() => {
    if (todayWeekY !== null && todayDayY !== null) onTodayLayout?.(todayWeekY + todayDayY);
  }, [todayWeekY, todayDayY, onTodayLayout]);

  return (
    <View style={styles.container}>
      {rows.map((days) => {
        const weekKey = toISODate(days[0]);
        const summary = weekSummary(days, workoutsByDate);
        const last = days[6];
        const range = `${days[0].getDate()} ${days[0].toLocaleDateString('it-IT', { month: 'short' })} – ${last.getDate()} ${last.toLocaleDateString('it-IT', { month: 'short' })}`;
        const hasToday = days.some((day) => toISODate(day) === todayISO);
        return (
          <View key={weekKey} style={styles.week} onLayout={hasToday ? (event) => setTodayWeekY(event.nativeEvent.layout.y) : undefined}>
            <View style={styles.weekHead}>
              <Text style={styles.weekTitle}>Settimana {isoWeekNumber(days[0])} <Text style={styles.weekRange}>· {range}</Text></Text>
              <View style={styles.stats}>
                <Stat label="Tempo" done={summary.doneSec ? formatShortDuration(summary.doneSec) : ''} planned={summary.plannedSec ? formatShortDuration(summary.plannedSec) : ''} />
                <Stat label="Km" done={summary.doneM ? (summary.doneM / 1000).toFixed(1) : ''} planned={summary.plannedM ? (summary.plannedM / 1000).toFixed(1) : ''} />
                <Stat label="TRIMP" done={summary.doneTrimp || ''} planned={summary.plannedTrimp || ''} />
              </View>
            </View>
            {days.map((day) => {
              const iso = toISODate(day);
              const isToday = iso === todayISO;
              const isPast = iso < todayISO;
              const dayWorkouts = workoutsByDate[iso] || [];
              return (
                <Pressable
                  key={iso}
                  onPress={() => onDayPress?.(iso, dayWorkouts)}
                  onLayout={isToday ? (event) => setTodayDayY(event.nativeEvent.layout.y) : undefined}
                  style={({ pressed }) => [styles.day, isToday && styles.dayToday, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.dateCol}>
                    <Text style={[styles.weekday, isToday && styles.todayText]}>{WEEKDAYS[day.getDay()]}</Text>
                    <View style={[styles.dayNumWrap, isToday && styles.dayNumToday]}>
                      <Text style={[styles.dayNum, isToday && { color: colors.textInverse }, isPast && !isToday && { color: colors.textMuted }]}>{day.getDate()}</Text>
                    </View>
                    {day.getDate() === 1 && <Text style={styles.month}>{day.toLocaleDateString('it-IT', { month: 'short' })}</Text>}
                  </View>
                  <View style={styles.items}>
                    {dayWorkouts.length ? dayWorkouts.map((workout) => (
                      <View key={workout.workout_id} style={workout.workout_id === selectedWorkoutId && styles.selected}>
                        <WorkoutBadge workout={workout} onPress={onWorkoutPress} />
                      </View>
                    )) : (
                      <Text style={styles.empty}>{emptyLabel || 'Nessun allenamento'}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  week: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  weekHead: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 4 },
  weekTitle: { color: colors.textInverse, fontWeight: '800', fontSize: 13 },
  weekRange: { fontWeight: '600', opacity: 0.85 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  statValue: { color: colors.textInverse, fontSize: 12, fontWeight: '800' },
  statPlanned: { fontWeight: '600', opacity: 0.8 },
  day: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.border, minHeight: 52 },
  dayToday: { backgroundColor: colors.primaryLight },
  dateCol: { width: 40, alignItems: 'center' },
  weekday: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  todayText: { color: colors.primary },
  dayNumWrap: { minWidth: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  dayNumToday: { backgroundColor: colors.today },
  dayNum: { fontSize: 17, fontWeight: '800', color: colors.text },
  month: { fontSize: 9, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
  items: { flex: 1, minWidth: 0, justifyContent: 'center', paddingTop: 2 },
  empty: { fontSize: 12, color: colors.textMuted, paddingTop: 8 },
  selected: { borderWidth: 2, borderColor: colors.warning, borderRadius: radius.sm },
});
