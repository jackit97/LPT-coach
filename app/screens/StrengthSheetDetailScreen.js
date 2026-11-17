import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import api from '../api/client';
import PlayButton from '../components/VideoPlayer';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function StrengthSheetDetailScreen({ route, navigation }) {
  const { sheet } = route.params;
  const { isCoach } = useAuth();
  const [savedDays, setSavedDays] = React.useState({});
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
  return <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
    <Text style={typography.h1}>{sheet.nome}</Text>
    <Text style={typography.caption}>{sheet.giorni.length} giorni · {sheet.datainizio ? String(sheet.datainizio).slice(0, 10) : 'senza data'}</Text>
    {isCoach && <Pressable style={styles.deleteButton} onPress={deleteSheet}><Text style={styles.deleteText}>Elimina scheda</Text></Pressable>}
    {sheet.giorni.map((day) => <View key={day.schedaid} style={styles.day}>
      <View style={styles.dayHeader}>
        <Text style={[typography.h2, { flex: 1 }]}>{day.nome}</Text>
        {isCoach && <Pressable style={styles.libraryButton} onPress={() => saveDayToLibrary(day)} disabled={savedDays[day.schedaid]}><Text style={styles.libraryText}>{savedDays[day.schedaid] ? '✓ In libreria' : 'Salva in libreria'}</Text></Pressable>}
      </View>
      {day.esercizi.map((exercise) => <View key={exercise.esercizioid} style={styles.exercise}>
        <View style={styles.exerciseHeader}><Text style={styles.exerciseName}>{exercise.nome}</Text>{!!exercise.video_url && <PlayButton url={exercise.video_url} title={exercise.nome} />}</View>
        <Text style={typography.caption}>{exercise.serie || '—'} serie · {exercise.ripetizioni || '—'} ripetizioni · recupero {exercise.recupero || '—'}</Text>
        {!!exercise.descrizione && <Text style={styles.notes}>{exercise.descrizione}</Text>}
        {!!exercise.note && <Text style={styles.notes}>{exercise.note}</Text>}
      </View>)}
      {!day.esercizi.length && <Text style={typography.caption}>Nessun esercizio associato.</Text>}
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, day: { marginTop: spacing.xl }, exercise: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm }, exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, exerciseName: { ...typography.h3, flex: 1 }, play: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, playText: { color: colors.textInverse, fontSize: 15 }, notes: { ...typography.body, marginTop: spacing.xs }, dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, libraryButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6 }, libraryText: { color: colors.primary, fontWeight: '700', fontSize: 12 }, deleteButton: { alignSelf: 'flex-start', marginTop: spacing.md, backgroundColor: '#FEE2E2', borderRadius: radius.md, padding: spacing.sm }, deleteText: { color: colors.danger, fontWeight: '700' } });