import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { colors, spacing, radius } from '../theme';
import WorkoutBadge from './WorkoutBadge';
import { toISODate, addDays, isoWeekNumber, workoutSeconds } from '../utils/dates';
import { formatShortDuration } from '../utils/endurance';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MAX_BADGES_PER_DAY = 3;
const NON_TRAINING = ['dieta', 'scadenza_dieta', 'scheda', 'scadenza_scheda', 'pagamento', 'riposo'];

// Riepilogo settimanale CoachPeaking: carico proposto vs effettuato (tempo, km, TRIMP).
export function weekSummary(days, workoutsByDate) {
  const sum = { plannedSec: 0, doneSec: 0, plannedM: 0, doneM: 0, plannedTrimp: 0, doneTrimp: 0 };
  days.forEach((day) => {
    (workoutsByDate[toISODate(day)] || []).forEach((w) => {
      if (NON_TRAINING.includes(w.tipo)) return;
      if (!w.load) {
        sum.plannedSec += workoutSeconds(w);
        return;
      }
      sum.plannedSec += w.load.secondi_pianificati;
      sum.doneSec += w.load.secondi_eseguiti;
      sum.plannedM += w.load.metri_pianificati;
      sum.doneM += w.load.metri_eseguiti;
      sum.plannedTrimp += w.load.trimp_pianificato;
      sum.doneTrimp += w.load.trimp_eseguito;
    });
  });
  return sum;
}

function SummaryLine({ label, done, planned, compact }) {
  const pct = planned > 0 ? Math.min(1.2, done / planned) : (done > 0 ? 1 : 0);
  const barColor = planned > 0 && pct < 0.7 ? colors.warning : colors.success;
  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {done}{!compact && planned ? <Text style={styles.summaryPlanned}> / {planned}</Text> : null}
      </Text>
      {compact && !!planned && <Text style={styles.summaryPlanned} numberOfLines={1}>/ {planned}</Text>}
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, pct * 100)}%`, backgroundColor: barColor }]} /></View>
    </View>
  );
}

export default function MonthCalendarGrid({ startDate, weeks = 5, workoutsByDate, onDayPress, onWorkoutPress, selectedWorkoutId }) {
  const rows = useMemo(
    () => Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(startDate, w * 7 + d))),
    [startDate, weeks],
  );
  const todayISO = toISODate(new Date());
  const { width } = useWindowDimensions();
  const compact = width < 700;

  return (
    <View style={styles.container}>
      <View style={styles.weekHeader}>
        <View style={styles.weekNumCol} />
        {WEEKDAYS.map((w) => <Text key={w} style={styles.weekHeaderText}>{w}</Text>)}
        <Text style={[styles.summaryHeader, { width: compact ? 58 : 104 }]}>{compact ? 'Sett.' : 'Eseguito / pian.'}</Text>
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
            <View style={[styles.summaryCol, { width: compact ? 58 : 104 }]}>
              <SummaryLine compact={compact} label="Tempo" done={formatShortDuration(summary.doneSec)} planned={summary.plannedSec ? formatShortDuration(summary.plannedSec) : ''} />
              {(summary.plannedM > 0 || summary.doneM > 0) && (
                <SummaryLine compact={compact} label="Km" done={(summary.doneM / 1000).toFixed(1)} planned={summary.plannedM ? (summary.plannedM / 1000).toFixed(1) : ''} />
              )}
              <SummaryLine compact={compact} label="TRIMP" done={summary.doneTrimp} planned={summary.plannedTrimp || ''} />
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
  summaryHeader: { textAlign: 'center', color: colors.textInverse, fontSize: 10, fontWeight: '700' },
  weekRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: colors.border },
  weekNumCol: { width: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  weekNum: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  cell: { flex: 1, minWidth: 0, minHeight: 92, borderLeftWidth: 0.5, borderLeftColor: colors.border, padding: 4 },
  cellMonthStart: { backgroundColor: colors.primaryLight },
  dayNumberWrap: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  dayNumberToday: { backgroundColor: colors.today },
  dayNumber: { fontSize: 11, fontWeight: '600', color: colors.text },
  dayNumberTodayText: { color: colors.textInverse },
  badgesWrap: { marginTop: 4 },
  moreText: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  selected: { borderWidth: 2, borderColor: colors.warning, borderRadius: radius.sm },
  summaryCol: { padding: 4, backgroundColor: colors.surfaceAlt, borderLeftWidth: 0.5, borderLeftColor: colors.border, gap: 4 },
  summaryBlock: {},
  summaryLabel: { fontSize: 8, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryValue: { fontSize: 11, fontWeight: '800', color: colors.text },
  summaryPlanned: { fontSize: 9, fontWeight: '600', color: colors.textMuted },
  progressTrack: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
});
