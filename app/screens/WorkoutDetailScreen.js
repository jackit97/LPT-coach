import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography, workoutTypeColors, statusColors } from '../theme';

const SENSAZIONI = ['ottimo', 'buono', 'normale', 'difficile', 'pessimo'];
const ZONE_COLORS = { Z1: '#8ED1D1', Z2: '#58C86B', Z3: '#F5E832', Z4: '#F4A340', Z5: '#EF4141', Z6: '#A83232', Z7: '#D96BE8' };

function formatDuration(workout) {
  const seconds = Number(workout.durata_secondi ?? (Number(workout.durata_minuti) || 0) * 60);
  if (!seconds) return 'durata libera';
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

function durationFromSteps(steps) {
  const parse = (value) => { const parts = String(value || '').split(':').map(Number); if (!parts.every(Number.isFinite)) return 0; if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; return parts.length === 2 ? parts[0] * 60 + parts[1] : 0; };
  return steps.reduce((total, step) => total + parse(step.duration), 0);
}

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
          try { await api.delete(`/calendar/${workoutId}`); navigation.goBack(); }
          catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile eliminare il workout'); }
        },
      },
    ]);
  };

  if (loading || !workout) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  const typeColor = workoutTypeColors[workout.tipo] || colors.primary;
  let structuredSteps = [];
  if (workout.endurance?.steps_json) {
    try { structuredSteps = JSON.parse(workout.endurance.steps_json); } catch { structuredSteps = []; }
  }
  const calculatedStepSeconds = durationFromSteps(structuredSteps);

  const exportFit = async () => {
    if (typeof window === 'undefined' || !window.document) return Alert.alert('Export FIT', 'Il download FIT è disponibile dalla versione web.');
    try {
      const response = await api.get(`/endurance/workouts/${workout.workout_id}/fit`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${String(workout.titolo || 'lpt-workout').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'lpt-workout'}.fit`;
      window.document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile esportare il workout FIT'); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={[styles.typeTag, { backgroundColor: typeColor + '1A', borderColor: typeColor }]}>
        <Text style={[styles.typeTagText, { color: typeColor }]}>{workout.tipo?.toUpperCase()}</Text>
      </View>

      <Text style={styles.title}>{workout.titolo}</Text>
      <Text style={styles.date}>{String(workout.data).slice(0, 10)} · {calculatedStepSeconds > 0 ? formatDuration({ durata_secondi: calculatedStepSeconds }) : formatDuration(workout)}</Text>

      <View style={[styles.statusPill, { backgroundColor: (statusColors[workout.stato] || colors.textMuted) + '1A' }]}>
        <Text style={{ color: statusColors[workout.stato] || colors.textMuted, fontWeight: '700', fontSize: 12 }}>
          {workout.stato}
        </Text>
      </View>

      {structuredSteps.length > 0 && (
        <View style={styles.chartSection}>
          <Text style={typography.h3}>Profilo allenamento</Text>
          <View style={styles.timeline}>
            {structuredSteps.flatMap((step) => (step.children || []).length ? step.children : [step]).map((step, index) => {
              const amount = Number(step.value || step.meters || 1) || 1;
              const height = Math.min(72, 18 + Math.round(Math.log10(amount + 1) * 22));
              return <View key={index} style={styles.barGroup}><View style={[styles.bar, { height, backgroundColor: ZONE_COLORS[String(step.zone || '').toUpperCase()] || colors.primary }]} /><Text style={styles.barLabel}>{step.zone || step.type || index + 1}</Text></View>;
            })}
          </View>
        </View>
      )}

      {!!workout.descrizione && (
        <View style={styles.section}>
          <Text style={typography.h3}>Descrizione</Text>
          <Text style={styles.paragraph}>{workout.descrizione}</Text>
        </View>
      )}

      {workout.scheda && (
        <View style={styles.section}>
          <Text style={typography.h3}>Scheda palestra</Text>
          <Text style={styles.detailLine}>
            Periodo: {String(workout.scheda.datainizio).slice(0, 10)} → {workout.scheda.datafine ? String(workout.scheda.datafine).slice(0, 10) : '—'}
          </Text>
          {!!workout.scheda.notegenerali && <Text style={styles.paragraph}>{workout.scheda.notegenerali}</Text>}
        </View>
      )}

      {workout.endurance && (
        <View style={styles.section}>
          <Text style={typography.h3}>Dettagli sessione</Text>
          <Pressable style={styles.fitButton} onPress={exportFit}><Text style={styles.fitButtonText}>Esporta workout Garmin (.FIT)</Text></Pressable>
          {!!workout.endurance.zone && <Text style={styles.detailLine}>Zona: {workout.endurance.zone}</Text>}
          {!!workout.endurance.target && <Text style={styles.detailLine}>Obiettivo: {workout.endurance.target}</Text>}
          {!!workout.endurance.rpe_target && <Text style={styles.detailLine}>RPE obiettivo: {workout.endurance.rpe_target}</Text>}
          {!!workout.endurance.description && <Text style={styles.paragraph}>{workout.endurance.description}</Text>}
          {!!workout.endurance.steps_text && <Text style={styles.paragraph}>{workout.endurance.steps_text}</Text>}
          {structuredSteps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <Text style={styles.stepTitle}>{step.type || `Fase ${index + 1}`} · {step.repeats || 1} x {step.meters ? `${step.meters} m` : (step.duration || 'durata libera')} {step.zone ? `· ${step.zone}` : ''}</Text>
              {!!step.notes && <Text style={styles.exerciseNote}>{step.notes}</Text>}
              {(step.children || []).map((child, childIndex) => <View key={childIndex} style={{ marginTop: spacing.xs, marginLeft: spacing.md, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.primary }}><Text style={styles.stepTitle}>{child.type || 'Sottofase'} · {child.repeats || 1} x {child.value || child.meters || child.duration || 'durata libera'} {child.unit || ''} {child.zone ? `· ${child.zone}` : ''}</Text>{!!child.notes && <Text style={styles.exerciseNote}>{child.notes}</Text>}</View>)}
            </View>
          ))}
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
              {!!ex.video_url && <Text style={styles.exerciseNote}>Video: {ex.video_url}</Text>}
            </View>
          ))}
        </View>
      )}

      {isCoach ? (
        <View style={styles.coachActions}>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate(workout.tipo === 'endurance' ? 'EnduranceWorkoutEditor' : 'WorkoutEditor', { workoutId: workout.workout_id })}>
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
  chartSection: { marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  timeline: { height: 104, flexDirection: 'row', alignItems: 'flex-end', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm },
  barGroup: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minWidth: 12 },
  bar: { width: '80%', minWidth: 6, borderRadius: 2 },
  barLabel: { fontSize: 9, color: colors.textMuted, marginTop: 4 },
  section: { marginTop: spacing.xl },
  fitButton: { alignSelf: 'flex-start', marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  fitButtonText: { color: colors.textInverse, fontWeight: '700', fontSize: 12 },
  paragraph: { ...typography.body, marginTop: spacing.sm, lineHeight: 20 },
  detailLine: { ...typography.caption, marginTop: spacing.xs },
  stepRow: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs },
  stepTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
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
