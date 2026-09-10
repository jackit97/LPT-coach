import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';

function formatDuration(workout) {
  const seconds = Number(workout.durata_secondi ?? (Number(workout.durata_minuti) || 0) * 60);
  if (!seconds) return '—';
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

export default function EnduranceScreen({ navigation }) {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!targetUserId) { setWorkouts([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/calendar', { params: { utenteId: targetUserId, from: '1970-01-01', to: '2999-12-31' } });
      setWorkouts((data || []).filter((workout) => workout.tipo === 'endurance'));
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (isCoach && !selectedAthlete) {
    return (
      <View style={styles.center}>
        <Text style={typography.h2}>Seleziona un atleta</Text>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Clients')}>
          <Text style={styles.primaryButtonText}>Vai ai tuoi atleti</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isCoach && <AthletePicker />}
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={(item) => String(item.workout_id)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListHeaderComponent={<Text style={styles.heading}>Allenamenti endurance</Text>}
          ListEmptyComponent={<Text style={styles.empty}>Nessun allenamento endurance ancora.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate('WorkoutDetail', { workoutId: item.workout_id })}>
              <Text style={typography.h3}>{item.titolo}</Text>
              <Text style={typography.caption}>{String(item.data).slice(0, 10)} · {formatDuration(item)}</Text>
              {!!item.descrizione && <Text style={styles.description}>{item.descrizione}</Text>}
            </Pressable>
          )}
        />
      )}

      {isCoach && targetUserId && (
        <Pressable style={styles.fab} onPress={() => setCreateMenuOpen(true)}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}

      <Modal visible={createMenuOpen} transparent animationType="fade" onRequestClose={() => setCreateMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setCreateMenuOpen(false)}>
          <View style={styles.menuCard}>
            <Text style={typography.h2}>Nuovo allenamento</Text>
            <Pressable style={styles.menuOption} onPress={() => { setCreateMenuOpen(false); navigation.navigate('EnduranceWorkoutEditor'); }}>
              <Text style={styles.menuTitle}>Endurance</Text><Text style={styles.menuText}>Fasi, metri, chilometri, zone e tempi stimati.</Text>
            </Pressable>
            <Pressable style={styles.menuOption} onPress={() => { setCreateMenuOpen(false); navigation.navigate('FunctionalWorkoutEditor'); }}>
              <Text style={styles.menuTitle}>Funzionale</Text><Text style={styles.menuText}>Esercizi dal catalogo con ripetizioni, metri o minuti.</Text>
            </Pressable>
            <Pressable style={styles.menuCancel} onPress={() => setCreateMenuOpen(false)}><Text style={styles.menuCancelText}>Annulla</Text></Pressable>
          </View>
        </Pressable>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  heading: { ...typography.h2, marginBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  description: { ...typography.caption, marginTop: spacing.xs },
  menuOverlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  menuCard: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  menuOption: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuTitle: { ...typography.h3, color: colors.primary },
  menuText: { ...typography.caption, marginTop: spacing.xs },
  menuCancel: { alignItems: 'center', padding: spacing.md, marginTop: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md },
  menuCancelText: { color: colors.text, fontWeight: '700' },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  fabText: { color: colors.textInverse, fontSize: 28, fontWeight: '700', marginTop: -2 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignItems: 'center', flex: 1 },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  secondaryButton: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flex: 1 },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  row: { flexDirection: 'row', gap: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
});
