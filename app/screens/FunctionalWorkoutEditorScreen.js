import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import ValuePicker from '../components/ValuePicker';
import RpeSelector from '../components/RpeSelector';
import { trimpFromRpe } from '../utils/endurance';
import { useAthlete } from '../context/AthleteContext';
import DraggableList, { moveItem } from '../components/DraggableList';
import ReorderHandle from '../components/ReorderHandle';
import { colors, spacing, radius, typography } from '../theme';

const UNITS = ['ripetizioni', 'metri', 'minuti'];
let keySeq = 0;
const withKey = (exercise) => ({ ...exercise, _key: `f${Date.now()}-${keySeq += 1}` });
const emptyExercise = () => withKey({ nome: '', amount: '', unit: 'ripetizioni', note: '' });

export default function FunctionalWorkoutEditorScreen({ route, navigation }) {
  const { targetUserId } = useAthlete();
  const [date, setDate] = useState(route.params?.date || new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(route.params?.coachNote || '');
  const [rpe, setRpe] = useState('');
  const [duration, setDuration] = useState('');
  const [exercises, setExercises] = useState([emptyExercise()]);
  const [search, setSearch] = useState({ index: null, query: '', results: [] });
  const [saving, setSaving] = useState(false);
  const [unitPickerIndex, setUnitPickerIndex] = useState(null);
  // Modalita' libreria: allenamento standard senza atleta ne' data
  const libraryTemplateId = route.params?.libraryTemplateId || null;
  const libraryMode = !!route.params?.libraryMode || !!libraryTemplateId;
  useEffect(() => {
    if (!libraryTemplateId) return;
    api.get(`/workouts/templates/${libraryTemplateId}`).then(({ data: template }) => {
      setTitle(template.nometemplate || '');
      setDescription(template.notegenerali || '');
      setRpe(template.rpe_pianificato ? String(template.rpe_pianificato) : '');
      const minutes = template.durata_minuti || (template.durata_secondi ? Math.round(template.durata_secondi / 60) : null);
      setDuration(minutes ? String(minutes) : '');
      const list = (template.esercizi || []).map((e) => {
        const load = String(e.carico || '');
        const meters = load.match(/^([\d.,]+)\s*m$/i);
        const minutesMatch = load.match(/^([\d.,]+)\s*min$/i);
        if (meters) return withKey({ nome: e.nomeesercizio, amount: meters[1], unit: 'metri', note: e.descrizione || '' });
        if (minutesMatch) return withKey({ nome: e.nomeesercizio, amount: minutesMatch[1], unit: 'minuti', note: e.descrizione || '' });
        return withKey({ nome: e.nomeesercizio, amount: e.ripetizioni || '', unit: 'ripetizioni', note: e.descrizione || '' });
      });
      setExercises(list.length ? list : [emptyExercise()]);
    }).catch(() => Alert.alert('Errore', 'Impossibile caricare l\'allenamento della libreria'));
  }, [libraryTemplateId]);

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
  const exercisePayload = () => exercises.filter((exercise) => exercise.nome).map((exercise) => ({ nome: exercise.nome, ripetizioni: exercise.unit === 'ripetizioni' ? exercise.amount : null, carico: exercise.unit === 'metri' ? `${exercise.amount} m` : exercise.unit === 'minuti' ? `${exercise.amount} min` : null, note: exercise.note }));
  const save = async () => {
    if (libraryMode) {
      if (!title.trim()) return Alert.alert('Errore', 'Il titolo è obbligatorio');
      setSaving(true);
      try {
        const payload = { nomeTemplate: title.trim(), noteGenerali: description || null, tipo: 'funzionale', durataMinuti: duration ? Number(duration) : null, rpePianificato: rpe ? Number(rpe) : null, esercizi: exercisePayload().map((exercise) => ({ ...exercise, descrizione: exercise.note })) };
        if (libraryTemplateId) await api.put(`/workouts/templates/${libraryTemplateId}`, payload);
        else await api.post('/workouts/templates', payload);
        navigation.goBack();
      } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare in libreria'); }
      finally { setSaving(false); }
      return;
    }
    if (!targetUserId || !date || !title.trim()) return Alert.alert('Errore', 'Data e titolo sono obbligatori');
    setSaving(true);
    try {
      await api.post('/calendar/functional', { utenteId: targetUserId, data: date, titolo: title.trim(), descrizione: description, durataMinuti: duration ? Number(duration) : null, rpePianificato: rpe ? Number(rpe) : null, esercizi: exercisePayload() });
      navigation.goBack();
    } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare l\'allenamento funzionale'); }
    finally { setSaving(false); }
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={typography.h1}>{libraryTemplateId ? 'Modifica allenamento funzionale' : libraryMode ? 'Nuovo funzionale in libreria' : 'Nuovo allenamento funzionale'}</Text>
    {libraryMode ? <Text style={[styles.loadHint, { color: colors.primary, fontWeight: '600' }]}>Allenamento standard: lo salvi in libreria e poi lo assegni a uno o più atleti.</Text>
      : <><Text style={styles.label}>Data</Text><DateField value={date} onChange={setDate} /></>}
    <Text style={styles.label}>Titolo</Text><TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Titolo" />
    <Text style={styles.label}>Durata totale personalizzata (minuti)</Text><TextInput value={duration} onChangeText={setDuration} keyboardType="numeric" style={styles.input} placeholder="Durata (min)" />
    <Text style={styles.label}>Intensità pianificata (RPE)</Text><RpeSelector value={rpe} onChange={setRpe} />
    {!!duration && <Text style={styles.loadHint}>Carico stimato: {trimpFromRpe(duration, rpe)} TRIMP</Text>}
    <Text style={styles.label}>Descrizione</Text><TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.area]} multiline placeholder="Descrizione" />
    <View style={styles.sectionHeader}><Text style={typography.h3}>Esercizi</Text></View>
    {exercises.length > 1 && <Text style={styles.loadHint}>Trascina ≡ (o usa le frecce) per cambiare l'ordine</Text>}
    <DraggableList
      data={exercises}
      keyExtractor={(exercise) => exercise._key}
      onReorder={(from, to) => { setSearch({ index: null, query: '', results: [] }); setExercises((current) => moveItem(current, from, to)); }}
      renderItem={({ item: exercise, index, handleProps, moveUp, moveDown, dragging }) => <View style={[styles.exercise, { flexDirection: 'row', gap: spacing.xs }, dragging && { backgroundColor: colors.primaryLight }]}>
      <ReorderHandle handleProps={handleProps} moveUp={moveUp} moveDown={moveDown} />
      <View style={{ flex: 1 }}>
      <View style={styles.exerciseHeader}><TextInput value={exercise.nome} onFocus={() => setSearch({ index, query: exercise.nome || '', results: [] })} onChangeText={(value) => { updateExercise(index, 'nome', value); setSearch({ index, query: value, results: [] }); }} style={[styles.input, styles.exerciseName]} placeholder="Cerca o scrivi esercizio" /><Pressable onPress={() => setExercises((current) => current.filter((_, exerciseIndex) => exerciseIndex !== index))}><Text style={styles.remove}>Elimina</Text></Pressable></View>
      {search.index === index && search.results.map((result) => <Pressable key={result.id} style={styles.suggestion} onPress={() => selectExercise(index, result)}><Text style={styles.suggestionText}>{result.nome}</Text></Pressable>)}
      <View style={styles.row}><ValuePicker value={exercise.amount} unit={exercise.unit} field={exercise.unit === 'ripetizioni' ? 'ripetizioni' : undefined} label="Valore" onChange={(value) => updateExercise(index, 'amount', value)} style={styles.amount} /><Pressable style={[styles.unit, styles.unitButton]} onPress={() => setUnitPickerIndex(index)}><Text>{exercise.unit}</Text></Pressable></View>
      <TextInput value={exercise.note} onChangeText={(value) => updateExercise(index, 'note', value)} style={styles.input} placeholder="Note" />
      </View>
    </View>}
    />
    <Pressable style={styles.addExerciseBtn} onPress={() => setExercises((current) => [...current, emptyExercise()])}><Text style={styles.addExerciseText}>+ Aggiungi esercizio</Text></Pressable>
    <Modal visible={unitPickerIndex !== null} transparent animationType="fade" onRequestClose={() => setUnitPickerIndex(null)}><Pressable style={styles.modalOverlay} onPress={() => setUnitPickerIndex(null)}><View style={styles.modalCard}>{UNITS.map((unit) => <Pressable key={unit} style={styles.option} onPress={() => { updateExercise(unitPickerIndex, 'unit', unit); setUnitPickerIndex(null); }}><Text style={styles.optionText}>{unit}</Text></Pressable>)}</View></Pressable></Modal>
    <View style={styles.actions}><Pressable style={styles.cancel} onPress={() => navigation.goBack()} disabled={saving}><Text>Annulla</Text></Pressable><Pressable style={styles.save} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{libraryMode ? 'Salva in libreria' : 'Salva allenamento'}</Text>}</Pressable></View>
  </ScrollView>;
}

const styles = StyleSheet.create({ addExerciseBtn: { marginTop: spacing.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', backgroundColor: colors.primaryLight },   addExerciseText: { color: colors.primary, fontWeight: '800', fontSize: 15 },  screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface }, area: { minHeight: 70, textAlignVertical: 'top' }, loadHint: { ...typography.caption, marginTop: spacing.xs, fontWeight: '700' }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm }, addLink: { color: colors.primary, fontWeight: '700' }, exercise: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm }, exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, exerciseName: { flex: 1, minWidth: 0 }, suggestion: { padding: spacing.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, suggestionText: { color: colors.text, fontWeight: '600' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, amount: { flex: 1, minWidth: 0 }, unitButton: { width: 110 }, unit: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface }, remove: { color: colors.danger, fontSize: 12, fontWeight: '700' }, modalOverlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: spacing.xl }, modalCard: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' }, option: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, optionText: { color: colors.text, fontWeight: '600' }, actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }, cancel: { flex: 1, padding: spacing.md, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md }, save: { flex: 1, padding: spacing.md, alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md }, saveText: { color: '#fff', fontWeight: '700' } });
