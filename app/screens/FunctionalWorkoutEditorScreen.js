import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import ValuePicker from '../components/ValuePicker';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';

const UNITS = ['ripetizioni', 'metri', 'minuti'];
const emptyExercise = () => ({ nome: '', amount: '', unit: 'ripetizioni', note: '' });

export default function FunctionalWorkoutEditorScreen({ route, navigation }) {
  const { targetUserId } = useAthlete();
  const [date, setDate] = useState(route.params?.date || new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [exercises, setExercises] = useState([emptyExercise()]);
  const [search, setSearch] = useState({ index: null, query: '', results: [] });
  const [saving, setSaving] = useState(false);
  const [unitPickerIndex, setUnitPickerIndex] = useState(null);

  useEffect(() => {
    if (search.index === null || search.query.trim().length < 2) { setSearch((current) => ({ ...current, results: [] })); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try { const { data } = await api.get('/exercises', { params: { q: search.query.trim() } }); if (!cancelled) setSearch((current) => ({ ...current, results: data || [] })); }
      catch { if (!cancelled) setSearch((current) => ({ ...current, results: [] })); }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search.index, search.query]);

  const updateExercise = (index, field, value) => setExercises((current) => current.map((exercise, exerciseIndex) => exerciseIndex === index ? { ...exercise, [field]: value } : exercise));
  const selectExercise = (index, result) => { updateExercise(index, 'nome', result.nome); setSearch({ index: null, query: '', results: [] }); };
  const save = async () => {
    if (!targetUserId || !date || !title.trim()) return Alert.alert('Errore', 'Data e titolo sono obbligatori');
    setSaving(true);
    try {
      await api.post('/calendar/functional', { utenteId: targetUserId, data: date, titolo: title.trim(), descrizione: description, durataMinuti: duration ? Number(duration) : null, esercizi: exercises.filter((exercise) => exercise.nome).map((exercise) => ({ nome: exercise.nome, ripetizioni: exercise.unit === 'ripetizioni' ? exercise.amount : null, carico: exercise.unit === 'metri' ? `${exercise.amount} m` : exercise.unit === 'minuti' ? `${exercise.amount} min` : null, note: exercise.note })) });
      navigation.goBack();
    } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare l\'allenamento funzionale'); }
    finally { setSaving(false); }
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={typography.h1}>Nuovo allenamento funzionale</Text>
    <Text style={styles.label}>Data</Text><DateField value={date} onChange={setDate} />
    <Text style={styles.label}>Titolo</Text><TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Circuito full body" />
    <Text style={styles.label}>Durata totale personalizzata (minuti)</Text><TextInput value={duration} onChangeText={setDuration} keyboardType="numeric" style={styles.input} placeholder="45" />
    <Text style={styles.label}>Descrizione</Text><TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.area]} multiline placeholder="Struttura e indicazioni del circuito" />
    <View style={styles.sectionHeader}><Text style={typography.h3}>Esercizi</Text><Pressable onPress={() => setExercises((current) => [...current, emptyExercise()])}><Text style={styles.addLink}>+ Aggiungi esercizio</Text></Pressable></View>
    {exercises.map((exercise, index) => <View key={index} style={styles.exercise}>
      <View style={styles.exerciseHeader}><TextInput value={exercise.nome} onFocus={() => setSearch({ index, query: exercise.nome || '', results: [] })} onChangeText={(value) => { updateExercise(index, 'nome', value); setSearch({ index, query: value, results: [] }); }} style={[styles.input, styles.exerciseName]} placeholder="Cerca o scrivi esercizio" /><Pressable onPress={() => setExercises((current) => current.filter((_, exerciseIndex) => exerciseIndex !== index))}><Text style={styles.remove}>Elimina</Text></Pressable></View>
      {search.index === index && search.results.map((result) => <Pressable key={result.id} style={styles.suggestion} onPress={() => selectExercise(index, result)}><Text style={styles.suggestionText}>{result.nome}</Text></Pressable>)}
      <View style={styles.row}><ValuePicker value={exercise.amount} unit={exercise.unit} field={exercise.unit === 'ripetizioni' ? 'ripetizioni' : undefined} label="Valore" onChange={(value) => updateExercise(index, 'amount', value)} style={styles.amount} /><Pressable style={[styles.unit, styles.unitButton]} onPress={() => setUnitPickerIndex(index)}><Text>{exercise.unit}</Text></Pressable></View>
      <TextInput value={exercise.note} onChangeText={(value) => updateExercise(index, 'note', value)} style={styles.input} placeholder="Note" />
    </View>)}
    <Modal visible={unitPickerIndex !== null} transparent animationType="fade" onRequestClose={() => setUnitPickerIndex(null)}><Pressable style={styles.modalOverlay} onPress={() => setUnitPickerIndex(null)}><View style={styles.modalCard}>{UNITS.map((unit) => <Pressable key={unit} style={styles.option} onPress={() => { updateExercise(unitPickerIndex, 'unit', unit); setUnitPickerIndex(null); }}><Text style={styles.optionText}>{unit}</Text></Pressable>)}</View></Pressable></Modal>
    <View style={styles.actions}><Pressable style={styles.cancel} onPress={() => navigation.goBack()} disabled={saving}><Text>Annulla</Text></Pressable><Pressable style={styles.save} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salva allenamento</Text>}</Pressable></View>
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface }, area: { minHeight: 70, textAlignVertical: 'top' }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm }, addLink: { color: colors.primary, fontWeight: '700' }, exercise: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm }, exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, exerciseName: { flex: 1 }, suggestion: { padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, suggestionText: { color: colors.text, fontWeight: '600' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, amount: { flex: 1 }, unitButton: { width: 110 }, unit: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface }, remove: { color: colors.danger, fontSize: 12, fontWeight: '700' }, modalOverlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: spacing.xl }, modalCard: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' }, option: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, optionText: { color: colors.text, fontWeight: '600' }, actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }, cancel: { flex: 1, padding: spacing.md, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md }, save: { flex: 1, padding: spacing.md, alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md }, saveText: { color: '#fff', fontWeight: '700' } });
