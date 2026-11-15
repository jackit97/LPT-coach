import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { workoutTypeColors, colors, radius, spacing } from '../theme';

const TYPE_LABELS = {
  forza: 'Forza',
  endurance: 'Endurance',
  mobilita: 'Mobilita',
  test: 'Test',
  riposo: 'Riposo',
  scadenza_scheda: 'Scadenza scheda',
  scadenza_dieta: 'Scadenza dieta',
};

const TYPE_ICONS = { endurance: '🏃', forza: '🏋', funzionale: '⚡', mobilita: '🧘', test: '⏱', dieta: '🍽', scadenza_dieta: '🍽', pagamento: '€', scheda: '📋', scadenza_scheda: '📋' };

export default function WorkoutBadge({ workout, onPress, compact }) {
  const isStrava = workout.external_provider === 'strava' || workout.colore === '#FC4C02';
  const color = isStrava ? '#FC4C02' : (workoutTypeColors[workout.tipo] || colors.primary);
  const isDone = workout.stato === 'completato';
  const isSkipped = workout.stato === 'saltato';
  const BadgeContainer = onPress ? Pressable : View;
  const baseStyle = [
    styles.badge,
    { backgroundColor: color + '1A', borderColor: color },
    isSkipped && styles.skipped,
    compact && styles.compact,
  ];

  return (
    <BadgeContainer
      {...(onPress ? { onPress: () => onPress(workout) } : {})}
      style={onPress ? ({ pressed }) => [...baseStyle, pressed && styles.pressed] : baseStyle}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.icon}>{isStrava ? '⚡' : (TYPE_ICONS[workout.tipo] || '•')}</Text>
      <Text numberOfLines={1} style={[styles.label, { color }]}>
        {workout.titolo || TYPE_LABELS[workout.tipo] || 'Workout'}
      </Text>
      {isStrava && (
        <View style={styles.stravaPill}>
          <Text style={styles.stravaPillText}>STRAVA</Text>
        </View>
      )}
      {isDone && <Text style={styles.check}>✓</Text>}
    </BadgeContainer>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 3,
    gap: 4,
  },
  compact: { paddingVertical: 2, paddingHorizontal: 4 },
  pressed: { opacity: 0.6 },
  skipped: { opacity: 0.5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  icon: { fontSize: 12, lineHeight: 14 },
  label: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  stravaPill: { backgroundColor: '#FC4C02', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2 },
  stravaPillText: { color: '#ffffff', fontSize: 8, fontWeight: '800' },
  check: { fontSize: 11, fontWeight: '700', color: colors.success },
});
