import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius, workoutTypeColors } from '../theme';
import WorkoutBadge from './WorkoutBadge';
import { toISODate, addDays, isoWeekNumber, workoutSeconds, formatHMS } from '../utils/dates';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MAX_BADGES_PER_DAY = 3;
const NON_TRAINING = ['dieta', 'scadenza_dieta', 'scheda', 'scadenza_scheda', 'pagamento', 'riposo'];
const TYPE_ICONS = { endurance: '🏃', forza: '🏋', funzionale: '⚡', mobilita: '🧘', test: '⏱' };

function weekSummary(days, workoutsByDate) {
  const byType = {};
  let total = 0;
  days.forEach((day) => {
    (workoutsByDate[toISODate(day)] || []).forEach((w) => {
      if (NON_TRAINING.includes(w.tipo)) return;
      const sec = workoutSeconds(w);
      total += sec;
      byType[w.tipo] = (byType[w.tipo] || 0) + sec;
    });
  });
  return { total, byType };
}

export default function MonthCalendarGrid({ startDate, weeks = 5, workoutsByDate, onDayPress, onWorkoutPress, selectedWorkoutId }) {
  const rows = useMemo(
    () => Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(startDate, w * 7 + d))),
    [startDate, weeks],
  );
  const todayISO = toISODate(new Date());

  return (
    <View style={styles.container}>
      <View style={styles.weekHeader}>
        <View style={styles.weekNumCol} />
        {WEEKDAYS.map((w) => <Text key={w} style={styles.weekHeaderText}>{w}</Text>)}
        <Text style={styles.summaryHeader}>Riepilogo</Text>
      </View>
      {rows.map((days) => {
        const summary = weekSummary(days, workoutsByDate);
        return (
          <View key={toISODate(days[0])} style={styles.weekRow}>
            <View style={styles.weekNumCol}>
              <Text style={styles.weekNum}>{isoWeekNumber(days[0])}</Text>
            </View>
            {days.map((day) => {
              const iso = toISODate(day);
              const isToday = iso === todayISO;
              const dayWorkouts = workoutsByDate[iso] || [];
              const extra = dayWorkouts.length - MAX_BADGES_PER_DAY;
              return (
                <Pressable
                  key={iso}
                  onPress={() => onDayPress?.(iso, dayWorkouts)}
                  style={[styles.cell, day.getDate() === 1 && styles.cellMonthStart]}
                >
                  <View style={[styles.dayNumberWrap, isToday && styles.dayNumberToday]}>
                    <Text style={[styles.dayNumber, isToday && styles.dayNumberTodayText]}>
                      {day.getDate()}{day.getDate() === 1 ? ` ${day.toLocaleDateString('it-IT', { month: 'short' })}` : ''}
                    </Text>
                  </View>
                  <View style={styles.badgesWrap}>
                    {dayWorkouts.slice(0, MAX_BADGES_PER_DAY).map((w) => (
                      <View key={w.workout_id} style={w.workout_id === selectedWorkoutId && styles.selected}>
                        <WorkoutBadge workout={w} compact onPress={onWorkoutPress} />
                      </View>
                    ))}
                    {extra > 0 && <Text style={styles.moreText}>+{extra} altri</Text>}
                  </View>
                </Pressable>
              );
            })}
            <View style={styles.summaryCol}>
              <Text style={styles.summaryTotal}>{formatHMS(summary.total)}</Text>
              {Object.entries(summary.byType).map(([type, sec]) => (
                <Text key={type} style={[styles.summaryLine, { color: workoutTypeColors[type] || colors.textMuted }]}>
                  {TYPE_ICONS[type] || '•'} {formatHMS(sec)}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  weekHeader: { flexDirection: 'row', backgroundColor: colors.primary, paddingVertical: spacing.sm },
  weekHeaderText: { flex: 1, textAlign: 'center', color: colors.textInverse, fontSize: 12, fontWeight: '700' },
  summaryHeader: { width: 64, textAlign: 'center', color: colors.textInverse, fontSize: 10, fontWeight: '700' },
  weekRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: colors.border },
  weekNumCol: { width: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  weekNum: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  cell: { flex: 1, minHeight: 92, borderLeftWidth: 0.5, borderLeftColor: colors.border, padding: 4 },
  cellMonthStart: { backgroundColor: colors.primaryLight },
  dayNumberWrap: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  dayNumberToday: { backgroundColor: colors.today },
  dayNumber: { fontSize: 11, fontWeight: '600', color: colors.text },
  dayNumberTodayText: { color: colors.textInverse },
  badgesWrap: { marginTop: 4 },
  moreText: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  selected: { borderWidth: 2, borderColor: colors.warning, borderRadius: radius.sm },
  summaryCol: { width: 64, padding: 4, backgroundColor: colors.surfaceAlt, borderLeftWidth: 0.5, borderLeftColor: colors.border },
  summaryTotal: { fontSize: 11, fontWeight: '700', color: colors.text, marginBottom: 2 },
  summaryLine: { fontSize: 10, fontWeight: '600' },
});
