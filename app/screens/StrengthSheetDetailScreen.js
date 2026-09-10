import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert } from 'react-native';
import api from '../api/client';
import { colors, spacing, radius, typography } from '../theme';

export default function StrengthSheetDetailScreen({ route, navigation }) {
  const { sheet } = route.params;
  const deleteSheet = () => Alert.alert('Elimina scheda', 'Sei sicuro?', [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: async () => { try { await Promise.all(sheet.giorni.map((day) => api.delete(`/calendar/strength-sheets/${day.schedaid}`))); navigation.goBack(); } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile eliminare la scheda'); } } },
  ]);
  return <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
    <Text style={typography.h1}>{sheet.nome}</Text>
    <Text style={typography.caption}>{sheet.giorni.length} giorni · {sheet.datainizio ? String(sheet.datainizio).slice(0, 10) : 'senza data'}</Text>
    <Pressable style={styles.deleteButton} onPress={deleteSheet}><Text style={styles.deleteText}>Elimina scheda</Text></Pressable>
    {sheet.giorni.map((day) => <View key={day.schedaid} style={styles.day}>
      <Text style={typography.h2}>{day.nome}</Text>
      {day.esercizi.map((exercise) => <View key={exercise.esercizioid} style={styles.exercise}>
        <View style={styles.exerciseHeader}><Text style={styles.exerciseName}>{exercise.nome}</Text>{exercise.video_url && <Pressable style={styles.play} onPress={() => Linking.openURL(exercise.video_url)}><Text style={styles.playText}>▶</Text></Pressable>}</View>
        <Text style={typography.caption}>{exercise.serie || '—'} serie · {exercise.ripetizioni || '—'} ripetizioni · recupero {exercise.recupero || '—'}</Text>
        {!!exercise.descrizione && <Text style={styles.notes}>{exercise.descrizione}</Text>}
        {!!exercise.note && <Text style={styles.notes}>{exercise.note}</Text>}
      </View>)}
      {!day.esercizi.length && <Text style={typography.caption}>Nessun esercizio associato.</Text>}
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, day: { marginTop: spacing.xl }, exercise: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm }, exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, exerciseName: { ...typography.h3, flex: 1 }, play: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, playText: { color: colors.textInverse, fontSize: 15 }, notes: { ...typography.body, marginTop: spacing.xs }, deleteButton: { alignSelf: 'flex-start', marginTop: spacing.md, backgroundColor: '#FEE2E2', borderRadius: radius.md, padding: spacing.sm }, deleteText: { color: colors.danger, fontWeight: '700' } });