import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import ValuePicker from '../components/ValuePicker';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';

const addDays = (value, days) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + Number(days || 0)); return date.toISOString().slice(0, 10); };
const createDay = (index, data = '', daysAfter = index === 0 ? 0 : 2) => ({ data, daysAfter, note: '', esercizi: [{ nome: '', serie: '', ripetizioni: '', recupero: '', descrizione: '', note: '' }], index });
const distributedDate = (start, index, count) => addDays(start, Math.floor((index * 7) / Math.max(1, count)));

export default function StrengthSheetEditorScreen({ route, navigation }) {
  const { targetUserId } = useAthlete();
  const [nome, setNome] = useState('');
  const [datainizio, setDatainizio] = useState(route.params?.date || '');
  const [datafine, setDatafine] = useState('');
  const [giorni, setGiorni] = useState([createDay(0, route.params?.date || '')]);
  const [exerciseSearch, setExerciseSearch] = useState({ dayIndex: null, exerciseIndex: null, query: '', results: [] });
  const [saving, setSaving] = useState(false);
  const addDay = () => giorni.length < 7 && setGiorni((current) => { const count = current.length + 1; return [...current, createDay(current.length, current[0]?.data ? distributedDate(current[0].data, current.length, count) : '', 2)].map((day, index) => ({ ...day, data: current[0]?.data ? distributedDate(current[0].data, index, count) : '' })); });
  const updateDay = (index, field, value) => setGiorni((current) => current.map((day, i) => i === index ? { ...day, [field]: value } : day));
  const updateStartDate = (value) => { setDatainizio(value); setGiorni((current) => current.map((day, index) => ({ ...day, data: value ? distributedDate(value, index, current.length) : '' }))); };
  const updateDayInterval = (index, value) => setGiorni((current) => current.map((day, i) => {
    if (i !== index) return day;
    const updated = { ...day, daysAfter: value };
    if (i > 0 && current[0]?.data) updated.data = addDays(current[0].data, current.slice(1, i + 1).reduce((sum, item, itemIndex) => sum + Number(itemIndex === i - 1 ? value : item.daysAfter || 0), 0));
    return updated;
  }));
  const updateExercise = (dayIndex, exerciseIndex, field, value) => setGiorni((current) => current.map((day, i) => i === dayIndex ? { ...day, esercizi: day.esercizi.map((exercise, j) => j === exerciseIndex ? { ...exercise, [field]: value } : exercise) } : day));
  const addExercise = (dayIndex) => setGiorni((current) => current.map((day, i) => i === dayIndex ? { ...day, esercizi: [...day.esercizi, { nome: '', serie: '', ripetizioni: '', recupero: '', descrizione: '', note: '' }] } : day));

  React.useEffect(() => {
    if (exerciseSearch.dayIndex === null || exerciseSearch.query.trim().length < 2) {
      setExerciseSearch((current) => ({ ...current, results: [] }));
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/exercises', { params: { q: exerciseSearch.query.trim() } });
        if (!cancelled) setExerciseSearch((current) => ({ ...current, results: data || [] }));
      } catch {
        if (!cancelled) setExerciseSearch((current) => ({ ...current, results: [] }));
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [exerciseSearch.dayIndex, exerciseSearch.exerciseIndex, exerciseSearch.query]);

  const updateExerciseName = (dayIndex, exerciseIndex, value) => {
    updateExercise(dayIndex, exerciseIndex, 'nome', value);
    setExerciseSearch({ dayIndex, exerciseIndex, query: value, results: [] });
  };

  const selectExercise = (dayIndex, exerciseIndex, exercise) => {
    updateExercise(dayIndex, exerciseIndex, 'nome', exercise.nome);
    setExerciseSearch({ dayIndex: null, exerciseIndex: null, query: '', results: [] });
  };
  const save = async () => {
    if (!nome.trim() || !datainizio || !datafine || !giorni.some((day) => day.data)) return Alert.alert('Errore', 'Inserisci nome scheda, data inizio e data scadenza');
    if (datafine < datainizio) return Alert.alert('Errore', 'La data scadenza deve essere successiva alla data inizio');
    setSaving(true);
    try { await api.post('/calendar/strength-sheets', { utenteId: targetUserId, nome: nome.trim(), dataInizio: datainizio, datafine, giorni }); navigation.goBack(); }
    catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile creare la scheda'); }
    finally { setSaving(false); }
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={typography.h1}>Nuova scheda pesistica</Text>
    <Text style={styles.label}>Nome scheda</Text><TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Forza base" />
    <Text style={styles.label}>Data inizio scheda</Text><DateField value={datainizio} onChange={updateStartDate} placeholder="Seleziona data inizio" />
    <Text style={styles.label}>Data scadenza scheda</Text><DateField value={datafine} onChange={setDatafine} placeholder="Seleziona scadenza" />
    {giorni.map((day, dayIndex) => <View key={dayIndex} style={styles.dayCard}>
      <Text style={typography.h2}>Giorno {dayIndex + 1}</Text><Text style={styles.label}>Data calcolata</Text><DateField value={day.data} onChange={(value) => updateDay(dayIndex, 'data', value)} />
      {dayIndex > 0 && <><Text style={styles.label}>Dopo quanti giorni dal giorno precedente?</Text><TextInput value={String(day.daysAfter)} onChangeText={(value) => updateDayInterval(dayIndex, value)} keyboardType="numeric" style={styles.input} placeholder="2" /></>}
      <Text style={styles.label}>Note giornata</Text><TextInput value={day.note} onChangeText={(value) => updateDay(dayIndex, 'note', value)} style={styles.input} placeholder="Obiettivo del giorno" />
      {day.esercizi.map((exercise, exerciseIndex) => <View key={exerciseIndex} style={styles.exercise}>
        <TextInput value={exercise.nome} onFocus={() => setExerciseSearch({ dayIndex, exerciseIndex, query: exercise.nome || '', results: [] })} onChangeText={(value) => updateExerciseName(dayIndex, exerciseIndex, value)} style={styles.input} placeholder="Cerca esercizio o scrivi manualmente" />
        {exerciseSearch.dayIndex === dayIndex && exerciseSearch.exerciseIndex === exerciseIndex && exerciseSearch.results.map((result) => <Pressable key={result.id} style={styles.suggestion} onPress={() => selectExercise(dayIndex, exerciseIndex, result)}><Text style={styles.suggestionText}>{result.nome}</Text></Pressable>)}
        <View style={styles.row}><ValuePicker value={exercise.serie} field="serie" label="Serie" onChange={(value) => updateExercise(dayIndex, exerciseIndex, 'serie', value)} style={styles.small} /><ValuePicker value={exercise.ripetizioni} field="ripetizioni" label="Rip" onChange={(value) => updateExercise(dayIndex, exerciseIndex, 'ripetizioni', value)} style={styles.small} /><TextInput value={exercise.recupero} onChangeText={(value) => updateExercise(dayIndex, exerciseIndex, 'recupero', value)} style={[styles.input, styles.medium]} placeholder="Recupero" /></View>
        <TextInput value={exercise.descrizione} onChangeText={(value) => updateExercise(dayIndex, exerciseIndex, 'descrizione', value)} style={styles.input} placeholder="Descrizione" />
      </View>)}<Pressable onPress={() => addExercise(dayIndex)}><Text style={styles.addLink}>+ Aggiungi esercizio</Text></Pressable>
    </View>)}
    {giorni.length < 7 && <Pressable style={styles.addDay} onPress={addDay}><Text style={styles.addDayText}>+ Aggiungi giorno ({giorni.length}/7)</Text></Pressable>}
    <View style={styles.actions}><Pressable style={styles.cancel} onPress={() => navigation.goBack()} disabled={saving}><Text>Annulla</Text></Pressable><Pressable style={styles.save} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salva scheda</Text>}</Pressable></View>
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs }, dayCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg }, exercise: { backgroundColor: colors.surfaceAlt, padding: spacing.sm, borderRadius: radius.sm, marginTop: spacing.sm }, suggestion: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.sm }, suggestionText: { color: colors.text, fontWeight: '600' }, row: { flexDirection: 'row', gap: spacing.xs }, small: { flex: 1 }, medium: { flex: 2 }, addLink: { color: colors.primary, fontWeight: '700', marginTop: spacing.sm }, addDay: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg }, addDayText: { color: colors.primary, fontWeight: '700' }, actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }, cancel: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }, save: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }, saveText: { color: '#fff', fontWeight: '700' } });