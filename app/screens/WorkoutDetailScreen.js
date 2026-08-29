import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography, workoutTypeColors, statusColors } from '../theme';

const SENSAZIONI = ['ottimo', 'buono', 'normale', 'difficile', 'pessimo'];

export default function WorkoutDetailScreen({ route, navigation }) {
  const { workoutId } = route.params;
  const { user, isCoach } = useAuth();
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);

  const [rpe, setRpe] = useState('');
  const [sensazione, setSensazione] = useState('');
  const [durataEffettiva, setDurataEffettiva] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/calendar/${workoutId}`);
      setWorkout(data);
      if (data.feedback) {
        setRpe(String(data.feedback.rpe ?? ''));
        setSensazione(data.feedback.sensazione ?? '');
        setDurataEffettiva(String(data.feedback.durata_effettiva_minuti ?? ''));
        setNote(data.feedback.note ?? '');
      }
    } catch (e) {
      Alert.alert('Errore', 'Impossibile caricare il workout');
    } finally {
      setLoading(false);
    }
  }, [workoutId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitFeedback = async (completato) => {
    setSaving(true);
    try {
      await api.post(`/calendar/${workoutId}/feedback`, {
        completato,
        rpe: rpe ? Number(rpe) : null,
        sensazione: sensazione || null,
        durataEffettivaMinuti: durataEffettiva ? Number(durataEffettiva) : null,
        note: note || null,
      });
      await load();
      Alert.alert('Fatto', 'Feedback salvato');
    } catch (e) {
      Alert.alert('Errore', 'Impossibile salvare il feedback');
    } finally {
      setSaving(false);
    }
  };

  const deleteWorkout = () => {
    Alert.alert('Elimina workout', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          await api.delete(`/calendar/${workoutId}`);
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading || !workout) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  const typeColor = workoutTypeColors[workout.tipo] || colors.primary;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={[styles.typeTag, { backgroundColor: typeColor + '1A', borderColor: typeColor }]}>
        <Text style={[styles.typeTagText, { color: typeColor }]}>{workout.tipo?.toUpperCase()}</Text>
      </View>

      <Text style={styles.title}>{workout.titolo}</Text>
      <Text style={styles.date}>{String(workout.data).slice(0, 10)} · {workout.durata_minuti ? `${workout.durata_minuti} min` : 'durata libera'}</Text>

      <View style={[styles.statusPill, { backgroundColor: (statusColors[workout.stato] || colors.textMuted) + '1A' }]}>
        <Text style={{ color: statusColors[workout.stato] || colors.textMuted, fontWeight: '700', fontSize: 12 }}>
          {workout.stato}
        </Text>
      </View>

      {!!workout.descrizione && (
        <View style={styles.section}>
          <Text style={typography.h3}>Descrizione</Text>
          <Text style={styles.paragraph}>{workout.descrizione}</Text>
        </View>
      )}

      {workout.esercizi?.length > 0 && (
        <View style={styles.section}>
          <Text style={typography.h3}>Esercizi</Text>
          {workout.esercizi.map((ex) => (
            <View key={ex.exercise_id} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>{ex.nome}</Text>
              <Text style={styles.exerciseMeta}>
                {[ex.serie && `${ex.serie} serie`, ex.ripetizioni && `${ex.ripetizioni} rip`, ex.carico, ex.recupero && `rec ${ex.recupero}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {!!ex.note && <Text style={styles.exerciseNote}>{ex.note}</Text>}
            </View>
          ))}
        </View>
      )}

      {isCoach ? (
        <View style={styles.coachActions}>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('WorkoutEditor', { workout })}>
            <Text style={styles.secondaryButtonText}>Modifica</Text>
          </Pressable>
          <Pressable style={styles.dangerButton} onPress={deleteWorkout}>
            <Text style={styles.dangerButtonText}>Elimina</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={typography.h3}>Il tuo feedback</Text>

          <Text style={styles.fieldLabel}>Come ti sei sentito?</Text>
          <View style={styles.chipsRow}>
            {SENSAZIONI.map((s) => (
              <Pressable key={s} onPress={() => setSensazione(s)} style={[styles.chip, sensazione === s && styles.chipActive]}>
                <Text style={[styles.chipText, sensazione === s && styles.chipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>RPE (1-10)</Text>
          <TextInput value={rpe} onChangeText={setRpe} keyboardType="numeric" style={styles.input} placeholder="7" />

          <Text style={styles.fieldLabel}>Durata effettiva (minuti)</Text>
          <TextInput value={durataEffettiva} onChangeText={setDurataEffettiva} keyboardType="numeric" style={styles.input} placeholder="60" />

          <Text style={styles.fieldLabel}>Note</Text>
          <TextInput value={note} onChangeText={setNote} style={[styles.input, styles.textArea]} multiline placeholder="Come è andata?" />

          <View style={styles.feedbackActions}>
            <Pressable style={styles.secondaryButton} onPress={() => submitFeedback(false)} disabled={saving}>
              <Text style={styles.secondaryButtonText}>Segna come saltato</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => submitFeedback(true)} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Segna completato</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  typeTag: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  typeTagText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  title: { ...typography.h1, marginTop: spacing.sm },
  date: { ...typography.caption, marginTop: spacing.xs },
  statusPill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginTop: spacing.sm },
  section: { marginTop: spacing.xl },
  paragraph: { ...typography.body, marginTop: spacing.sm, lineHeight: 20 },
  exerciseRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border },
  exerciseName: { fontWeight: '700', fontSize: 14, color: colors.text },
  exerciseMeta: { ...typography.caption, marginTop: 2 },
  exerciseNote: { ...typography.caption, marginTop: 4, fontStyle: 'italic' },
  coachActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  feedbackActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  primaryButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
  dangerButton: { flex: 1, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerButtonText: { color: colors.danger, fontWeight: '700' },
});
