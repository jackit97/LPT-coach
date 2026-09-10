import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import WorkoutBadge from '../components/WorkoutBadge';
import { colors, spacing, radius, typography } from '../theme';

function formatDuration(workout) {
  const seconds = Number(workout.durata_secondi ?? (Number(workout.durata_minuti) || 0) * 60);
  if (!seconds) return '—';
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

export default function DayWorkoutsScreen({ route, navigation }) {
  const { date, workouts } = route.params;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{date}</Text>
      <FlatList
        data={workouts}
        keyExtractor={(w) => String(w.workout_id)}
        contentContainerStyle={{ padding: spacing.lg }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => ['dieta', 'scadenza_dieta', 'scheda', 'scadenza_scheda', 'pagamento'].includes(item.tipo)
              ? Alert.alert(item.titolo, item.descrizione || 'Evento calendario')
              : navigation.navigate('WorkoutDetail', { workoutId: item.workout_id })}
          >
            <WorkoutBadge workout={item} />
            {!!(item.durata_secondi || item.durata_minuti) && <Text style={styles.meta}>{formatDuration(item)}</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { ...typography.h2, padding: spacing.lg, paddingBottom: 0 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  meta: { ...typography.caption, marginTop: spacing.xs },
});
