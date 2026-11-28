import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import SupersetTag, { supersetBorder } from '../components/SupersetTag';
import { supersetInfo } from '../utils/superset';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import ExerciseSheet from '../components/ExerciseSheet';
import LogStrengthDayModal from '../components/LogStrengthDayModal';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';

export default function StrengthSheetDetailScreen({ route, navigation }) {
  const { isCoach } = useAuth();
  const { targetUserId } = useAthlete();
  const [sheet, setSheet] = useState(route.params.sheet);
  const [savedDays, setSavedDays] = useState({});
  const [openExercise, setOpenExercise] = useState(null);
  const [logDay, setLogDay] = useState(null);

  // Ricarica la scheda per avere video e note sempre aggiornati
  useFocusEffect(useCallback(() => {
    api.get('/calendar/strength-sheets', { params: isCoach ? { utenteId: targetUserId } : {} })
      .then(({ data }) => {
        const fresh = (data || []).find((item) => item.nome === route.params.sheet.nome);
        if (fresh) setSheet(fresh);
      })
      .catch(() => {});
  }, [isCoach, targetUserId, route.params.sheet.nome]));

  // Ogni giorno della scheda diventa un allenamento di forza riutilizzabile in libreria
  const saveDayToLibrary = async (day) => {
    try {
      await api.post(`/workouts/templates/from-sheet/${day.schedaid}`, {});
      setSavedDays((current) => ({ ...current, [day.schedaid]: true }));
      Alert.alert('Libreria', `${sheet.nome} · ${day.nome} salvato in libreria`);
    } catch (error) {
      Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare in libreria');
    }
  };
  const deleteSheet = () => Alert.alert('Elimina scheda', 'Sei sicuro?', [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: async () => { try { await Promise.all(sheet.giorni.map((day) => api.delete(`/calendar/strength-sheets/${day.schedaid}`))); navigation.goBack(); } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile eliminare la scheda'); } } },
  ]);

  const onNoteSaved = (id, note, at) => {
    setSheet((current) => ({
      ...current,
      giorni: current.giorni.map((day) => ({
        ...day,
        esercizi: day.esercizi.map((exercise) => (exercise.esercizioid === id ? { ...exercise, note_atleta: note, note_atleta_at: at } : exercise)),
      })),
    }));
    setOpenExercise((current) => (current && current.esercizioid === id ? { ...current, note_atleta: note } : current));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={typography.h1}>{sheet.nome}</Text>
      <Text style={typography.caption}>{sheet.giorni.length} giorni · {sheet.datainizio ? String(sheet.datainizio).slice(0, 10) : 'senza data'}</Text>
      {!isCoach && <Text style={styles.hint}>Tocca un esercizio per vedere indicazioni e video e scrivere le tue note.</Text>}
      {isCoach && (
        <View style={styles.coachActions}>
          <Pressable style={styles.editButton} onPress={() => navigation.navigate('StrengthSheetEditor', { editSheet: sheet })}>
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={styles.editText}>Modifica scheda</Text>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={deleteSheet}><Text style={styles.deleteText}>Elimina scheda</Text></Pressable>
        </View>
      )}
      {sheet.giorni.map((day) => (
        <View key={day.schedaid} style={styles.day}>
          <View style={styles.dayHeader}>
            <Text style={[typography.h2, { flex: 1 }]}>{day.nome}</Text>
            {isCoach && <Pressable style={styles.libraryButton} onPress={() => saveDayToLibrary(day)} disabled={savedDays[day.schedaid]}><Text style={styles.libraryText}>{savedDays[day.schedaid] ? '✓ In libreria' : 'Salva in libreria'}</Text></Pressable>}
            {!isCoach && (
              <Pressable style={styles.doneButton} onPress={() => setLogDay(day.schedaid)}>
                <Ionicons name="checkmark" size={15} color="#fff" />
                <Text style={styles.doneText}>L'ho fatto</Text>
              </Pressable>
            )}
          </View>
          {!!String(day.note || '').trim() && <Text style={styles.dayNote}>{day.note}</Text>}
          {day.esercizi.map((exercise, index) => (
            <Pressable key={exercise.esercizioid || `${day.schedaid}-${index}`} style={({ pressed }) => [styles.exercise, supersetInfo(day.esercizi)[index] && supersetBorder, pressed && { opacity: 0.8 }]} onPress={() => setOpenExercise(exercise)}>
              <SupersetTag info={supersetInfo(day.esercizi)[index]} />
              <View style={styles.exerciseHeader}>
                <Text style={styles.exerciseName}>{exercise.nome}</Text>
                {!!exercise.video_url && (
                  <View style={styles.playBadge}><Ionicons name="play" size={16} color="#fff" style={{ marginLeft: 2 }} /></View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={styles.prescription}>
                {[exercise.serie && `${exercise.serie} serie`, exercise.ripetizioni && `${exercise.ripetizioni} rip`, exercise.recupero && `rec ${exercise.recupero}`].filter(Boolean).join(' · ') || 'Apri per i dettagli'}
              </Text>
              {(!!exercise.descrizione || !!exercise.note) && <Text style={styles.notes} numberOfLines={2}>{exercise.descrizione || exercise.note}</Text>}
              {!!exercise.note_atleta && (
                <View style={styles.noteChip}>
                  <Ionicons name="create-outline" size={13} color={colors.accent} />
                  <Text style={styles.noteChipText} numberOfLines={1}>{isCoach ? 'Nota atleta: ' : 'La mia nota: '}{exercise.note_atleta}</Text>
                </View>
              )}
            </Pressable>
          ))}
          {!day.esercizi.length && <Text style={typography.caption}>Nessun esercizio associato.</Text>}
        </View>
      ))}
      <LogStrengthDayModal
        visible={!!logDay}
        sheets={[sheet]}
        defaultSchedaId={logDay}
        onClose={() => setLogDay(null)}
        onLogged={(result) => { setLogDay(null); if (result?.workout_id) navigation.navigate('CalendarTab', { screen: 'WorkoutDetail', params: { workoutId: result.workout_id }, initial: false }); }}
      />
      <ExerciseSheet
        visible={!!openExercise}
        exercise={openExercise}
        source="scheda"
        isCoach={isCoach}
        onClose={() => setOpenExercise(null)}
        onSaved={onNoteSaved}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' },
  hint: { ...typography.caption, marginTop: spacing.sm, color: colors.accent, fontWeight: '600' },
  day: { marginTop: spacing.xl },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exercise: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: '#2563EB', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exerciseName: { ...typography.h3, flex: 1 },
  playBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  prescription: { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 4 },
  dayNote: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  notes: { ...typography.caption, marginTop: 4, fontWeight: '700', color: colors.text },
  noteChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs, backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start', maxWidth: '100%' },
  noteChipText: { fontSize: 12, color: colors.accent, fontWeight: '600', flexShrink: 1 },
  doneButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  libraryButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  libraryText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  coachActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  editText: { color: '#fff', fontWeight: '800' },
  deleteButton: { alignSelf: 'flex-start', backgroundColor: '#FEE2E2', borderRadius: radius.md, padding: spacing.sm },
  deleteText: { color: colors.danger, fontWeight: '700' },
});
