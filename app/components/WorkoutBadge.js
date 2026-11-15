import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { workoutTypeColors, colors, radius } from '../theme';
import { ZONE_COLORS, sportInfo, formatShortDuration } from '../utils/endurance';

const TYPE_LABELS = {
  forza: 'Forza',
  endurance: 'Endurance',
  mobilita: 'Mobilita',
  funzionale: 'Funzionale',
  test: 'Test',
  riposo: 'Riposo',
  scadenza_scheda: 'Scadenza scheda',
  scadenza_dieta: 'Scadenza dieta',
};

const TYPE_ICONS = { endurance: '🏃', forza: '🏋', funzionale: '⚡', mobilita: '🧘', test: '⏱', dieta: '🍽', scadenza_dieta: '🍽', pagamento: '€', scheda: '📋', scadenza_scheda: '📋' };

// Mini profilo dell'allenamento: segmenti colorati per zona, larghi in proporzione alla durata.
function ZoneStrip({ profile }) {
  if (!profile?.length) return null;
  return (
    <View style={styles.strip}>
      {profile.map((segment, index) => {
        const level = Number(String(segment.zone).replace(/\D/g, '')) || 1;
        return (
          <View
            key={index}
            style={{
              flex: Math.max(1, segment.seconds),
              height: 3 + level * 1.4,
              backgroundColor: ZONE_COLORS[segment.zone] || colors.primary,
              alignSelf: 'flex-end',
            }}
          />
        );
      })}
    </View>
  );
}

export default function WorkoutBadge({ workout, onPress, compact }) {
  const isStrava = workout.external_provider === 'strava' || workout.colore === '#FC4C02';
  const sport = sportInfo(workout.sport);
  const color = isStrava ? '#FC4C02' : (sport?.color || workoutTypeColors[workout.tipo] || colors.primary);
  const isDone = workout.stato === 'completato';
  const isSkipped = workout.stato === 'saltato';
  const load = workout.load;
  const seconds = load ? (load.secondi_eseguiti || load.secondi_pianificati) : 0;
  const meters = load ? (load.metri_eseguiti || load.metri_pianificati) : 0;
  const trimp = load ? (load.trimp_eseguito || load.trimp_pianificato) : 0;
  const BadgeContainer = onPress ? Pressable : View;
  const baseStyle = [
    styles.badge,
    { backgroundColor: color + '14', borderLeftColor: color },
    isSkipped && styles.skipped,
    compact && styles.compact,
  ];

  return (
    <BadgeContainer
      {...(onPress ? { onPress: () => onPress(workout) } : {})}
      style={onPress ? ({ pressed }) => [...baseStyle, pressed && styles.pressed] : baseStyle}
    >
      <View style={styles.titleRow}>
        <Text style={styles.icon}>{isStrava ? '⚡' : (sport?.icon || TYPE_ICONS[workout.tipo] || '•')}</Text>
        <Text numberOfLines={1} style={[styles.label, { color }]}>
          {workout.titolo || TYPE_LABELS[workout.tipo] || 'Workout'}
        </Text>
        {isDone && <Text style={styles.check}>✓</Text>}
        {isSkipped && <Text style={styles.skip}>✕</Text>}
      </View>
      <ZoneStrip profile={load?.zone_profile} />
      {load && seconds > 0 && (
        <Text numberOfLines={1} style={styles.meta}>
          {formatShortDuration(seconds)}
          {meters > 0 ? ` · ${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)}km` : ''}
          {!compact && trimp > 0 ? ` · ${trimp} TRIMP` : ''}
        </Text>
      )}
      {isStrava && !compact && (
        <View style={styles.stravaPill}>
          <Text style={styles.stravaPillText}>STRAVA</Text>
        </View>
      )}
    </BadgeContainer>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: 5,
    marginBottom: 3,
  },
  compact: { paddingVertical: 2, paddingHorizontal: 3 },
  pressed: { opacity: 0.6 },
  skipped: { opacity: 0.5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  icon: { fontSize: 11, lineHeight: 14 },
  label: { fontSize: 11, fontWeight: '700', flexShrink: 1, flexGrow: 1 },
  meta: { fontSize: 9, color: colors.textMuted, fontWeight: '600', marginTop: 1 },
  strip: { flexDirection: 'row', alignItems: 'flex-end', height: 13, marginTop: 2, gap: 1, overflow: 'hidden' },
  stravaPill: { alignSelf: 'flex-start', backgroundColor: '#FC4C02', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2, marginTop: 2 },
  stravaPillText: { color: '#ffffff', fontSize: 8, fontWeight: '800' },
  check: { fontSize: 11, fontWeight: '800', color: colors.success },
  skip: { fontSize: 10, fontWeight: '800', color: colors.danger },
});
