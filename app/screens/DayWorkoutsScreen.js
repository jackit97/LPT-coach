import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import WorkoutBadge from '../components/WorkoutBadge';
import { colors, spacing, radius, typography } from '../theme';

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
            onPress={() => navigation.navigate('WorkoutDetail', { workoutId: item.workout_id })}
          >
            <WorkoutBadge workout={item} />
            {!!item.durata_minuti && <Text style={styles.meta}>{item.durata_minuti} min</Text>}
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
