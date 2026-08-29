import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import WorkoutBadge from './WorkoutBadge';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MAX_BADGES_PER_DAY = 3;

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function buildMonthMatrix(year, month) {
  // month: 0-based
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first grid
  const gridStart = new Date(year, month, 1 - startOffset);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function MonthCalendarGrid({ year, month, workoutsByDate, onDayPress, onWorkoutPress }) {
  const days = useMemo(() => buildMonthMatrix(year, month), [year, month]);
  const todayISO = toISODate(new Date());

  return (
    <View style={styles.container}>
      <View style={styles.weekHeader}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekHeaderText}>{w}</Text>
        ))}
      </View>
      <ScrollView>
        <View style={styles.grid}>
          {days.map((day) => {
            const iso = toISODate(day);
            const inMonth = day.getMonth() === month;
            const isToday = iso === todayISO;
            const dayWorkouts = workoutsByDate[iso] || [];
            const extra = dayWorkouts.length - MAX_BADGES_PER_DAY;

            return (
              <Pressable
                key={iso}
                onPress={() => onDayPress?.(iso, dayWorkouts)}
                style={[styles.cell, !inMonth && styles.cellOutside]}
              >
                <View style={[styles.dayNumberWrap, isToday && styles.dayNumberToday]}>
                  <Text style={[styles.dayNumber, !inMonth && styles.dayNumberOutside, isToday && styles.dayNumberTodayText]}>
                    {day.getDate()}
                  </Text>
                </View>
                <View style={styles.badgesWrap}>
                  {dayWorkouts.slice(0, MAX_BADGES_PER_DAY).map((w) => (
                    <WorkoutBadge key={w.workout_id} workout={w} compact onPress={onWorkoutPress} />
                  ))}
                  {extra > 0 && <Text style={styles.moreText}>+{extra} altri</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const CELL_WIDTH = '14.28%';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  weekHeader: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
  },
  weekHeaderText: {
    width: CELL_WIDTH,
    textAlign: 'center',
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL_WIDTH,
    minHeight: 92,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: 4,
  },
  cellOutside: { backgroundColor: colors.surfaceAlt },
  dayNumberWrap: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  dayNumberToday: { backgroundColor: colors.today },
  dayNumber: { fontSize: 12, fontWeight: '600', color: colors.text },
  dayNumberOutside: { color: colors.textMuted },
  dayNumberTodayText: { color: colors.textInverse },
  badgesWrap: { marginTop: 4 },
  moreText: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
});
