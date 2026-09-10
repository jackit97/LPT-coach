import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import ValuePicker from '../components/ValuePicker';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';

const PHASES = ['Riscaldamento', 'Attivazione', 'Lavoro', 'Recupero', 'Defaticamento'];
const UNITS = ['m', 'km', 'min'];
const emptyBlock = (type = 'Lavoro') => ({ type, repeats: '1', unit: 'm', value: '', duration: '', zone: 'Z4', notes: '', children: [] });

function parsePace(value) {
  const match = String(value || '').match(/(\d+):([0-5]\d)/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function parseDurationValue(value) {
  const text = String(value || '').trim();
  if (text.includes(':')) {
    const [minutes, seconds] = text.split(':').map(Number);
    return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : null;
  }
  const minutes = Number(text.replace(',', '.'));
  return Number.isFinite(minutes) ? minutes * 60 : null;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'Inserisci valore';
  const rounded = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

export default function EnduranceWorkoutEditorScreen({ route, navigation }) {
  const workoutId = route.params?.workoutId;
  const isEdit = Boolean(workoutId);
  const { targetUserId } = useAthlete();
    const [date, setDate] = useState(route.params?.date || new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [zone, setZone] = useState('Z2');
  const [duration, setDuration] = useState('45');
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');
  const [rpe, setRpe] = useState('');
  const [blocks, setBlocks] = useState([emptyBlock('Riscaldamento')]);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState({ pace: [] });
  const [picker, setPicker] = useState(null);

  useEffect(() => {
    if (!workoutId) return;
    api.get(`/calendar/${workoutId}`).then(({ data }) => {
      setDate(String(data.data).slice(0, 10)); setTitle(data.titolo || ''); setDuration(String(data.durata_minuti || ''));
      setDescription(data.descrizione || ''); setZone(data.endurance?.zone || 'Z2'); setTarget(data.endurance?.target || '');
      setRpe(data.endurance?.rpe_target ? String(data.endurance.rpe_target) : '');
      if (data.endurance?.steps_json) {
        try {
          setBlocks(JSON.parse(data.endurance.steps_json).map((block) => ({ ...block, unit: block.unit || (block.meters ? 'm' : 'min'), value: block.value ?? block.meters ?? '', children: Array.isArray(block.children) ? block.children : [] })));
        } catch { setBlocks([emptyBlock('Lavoro')]); }
      }
    }).catch(() => Alert.alert('Errore', 'Impossibile caricare l\'allenamento'));
  }, [workoutId]);

  useEffect(() => {
    api.get('/zones', { params: { utenteId: targetUserId } }).then(({ data }) => setZones(data.zones || { pace: [] })).catch(() => {});
  }, [targetUserId]);

  const updateBlock = (index, field, value) => setBlocks((current) => current.map((block, blockIndex) => blockIndex === index ? { ...block, [field]: value } : block));
  const updateChild = (parentIndex, childIndex, field, value) => setBlocks((current) => current.map((block, blockIndex) => blockIndex === parentIndex ? { ...block, children: (block.children || []).map((child, index) => index === childIndex ? { ...child, [field]: value } : child) } : block));
  const addBlock = () => setBlocks((current) => [...current, emptyBlock()]);
  const removeBlock = (index) => setBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index));
  const addChild = (parentIndex) => setBlocks((current) => current.map((block, blockIndex) => blockIndex === parentIndex ? { ...block, children: [...(block.children || []), emptyBlock('Lavoro')] } : block));
  const removeChild = (parentIndex, childIndex) => setBlocks((current) => current.map((block, blockIndex) => blockIndex === parentIndex ? { ...block, children: (block.children || []).filter((_, index) => index !== childIndex) } : block));

  const zoneOptions = [...new Set([...(zones.pace || []).map((item) => item.key), 'Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'])];
  const estimateSeconds = (block) => {
    const repeats = Number(block.repeats) || 0;
    if (!repeats) return null;
    if (block.unit === 'min') {
      const durationSeconds = parseDurationValue(block.value);
      return durationSeconds ? durationSeconds * repeats : null;
    }
    const value = Number(String(block.value || '').replace(',', '.'));
    if (!value) return null;
    const selected = (zones.pace || []).find((item) => item.key === block.zone);
    const paceValues = selected ? [parsePace(selected.min), parsePace(selected.max)].filter(Boolean) : [];
    if (!paceValues.length) return null;
    const secondsPerKm = paceValues.reduce((sum, item) => sum + item, 0) / paceValues.length;
    return (block.unit === 'km' ? value : value / 1000) * secondsPerKm * repeats;
  };
  const totalSeconds = blocks.reduce((sum, block) => sum + ((block.children || []).length ? (block.children || []).reduce((childSum, child) => childSum + (estimateSeconds(child) || 0), 0) : (estimateSeconds(block) || 0)), 0);
  const updateBlockField = (index, field, value) => updateBlock(index, field, value);

  const save = async () => {
    if (!targetUserId || !date || !title.trim() || !duration) return Alert.alert('Errore', 'Data, titolo e durata sono obbligatori');
    setSaving(true);
    try {
      const calculatedDuration = totalSeconds > 0 ? Math.ceil(totalSeconds / 60) : Number(duration);
      const payload = { utenteId: targetUserId, date, title: title.trim(), zone, durationMinutes: calculatedDuration, durationSeconds: totalSeconds > 0 ? Math.ceil(totalSeconds) : Number(duration) * 60, target, description, rpeTarget: rpe ? Number(rpe) : null, stepsJson: blocks.map((block) => ({ ...block, duration: formatDuration((block.children || []).length ? (block.children || []).reduce((sum, child) => sum + (estimateSeconds(child) || 0), 0) : estimateSeconds(block)), children: (block.children || []).map((child) => ({ ...child, duration: formatDuration(estimateSeconds(child)) })) })) };
      if (isEdit) await api.put(`/endurance/workouts/${workoutId}`, payload);
      else await api.post('/endurance/workouts', payload);
      if (isEdit) navigation.replace('WorkoutDetail', { workoutId });
      else navigation.goBack();
    } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile creare l\'allenamento'); }
    finally { setSaving(false); }
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={typography.h1}>{isEdit ? 'Modifica allenamento endurance' : 'Nuovo allenamento endurance'}</Text>
    <Text style={styles.label}>Data</Text><DateField value={date} onChange={setDate} style={styles.dateField} />
    <Text style={styles.label}>Titolo</Text><TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="6x600 Z4 + 6x300 Z5" />
    <View style={styles.row}><View style={styles.half}><Text style={styles.label}>Zona generale</Text><TextInput value={zone} onChangeText={setZone} style={styles.input} placeholder="Z2" /></View><View style={styles.half}><Text style={styles.label}>Durata totale calcolata</Text><View style={styles.calculated}><Text style={styles.calculatedText}>{formatDuration(totalSeconds || Number(duration) * 60)}</Text></View></View></View>
    <Text style={styles.label}>Obiettivo</Text><TextInput value={target} onChangeText={setTarget} style={styles.input} placeholder="Soglia, volume, tecnica..." />
    <Text style={styles.label}>Descrizione</Text><TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.area]} multiline placeholder="Istruzioni generali" />
    <Text style={styles.label}>RPE obiettivo</Text><TextInput value={rpe} onChangeText={setRpe} keyboardType="numeric" style={styles.input} placeholder="7" />
    <View style={styles.sectionHeader}><Text style={typography.h3}>Struttura allenamento</Text><Pressable onPress={addBlock}><Text style={styles.addLink}>+ Aggiungi fase</Text></Pressable></View>
    {blocks.map((block, index) => <View key={index} style={styles.block}>
      <View style={styles.blockHeader}><Text style={styles.number}>{index + 1}</Text><Pressable style={[styles.picker, styles.type, { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }]} onPress={() => setPicker({ type: 'phase', index })}><Text numberOfLines={1} style={{ flex: 1 }}>{block.type || 'Scegli fase'}</Text><Text style={{ color: colors.textMuted, fontSize: 10, lineHeight: 12 }}>▼</Text></Pressable><Pressable onPress={() => removeBlock(index)}><Text style={styles.remove}>Elimina</Text></Pressable></View>
      <View style={styles.row}><ValuePicker value={block.repeats} field="serie" label="Serie" onChange={(value) => updateBlockField(index, 'repeats', value)} style={styles.small} /><Text style={styles.x}>x</Text><ValuePicker value={block.value} unit={block.unit} label="Valore" onChange={(value) => updateBlockField(index, 'value', value)} style={styles.medium} /><Pressable style={[styles.picker, styles.medium, { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }]} onPress={() => setPicker({ type: 'unit', index })}><Text numberOfLines={1} style={{ flex: 1 }}>{block.unit || 'Unità'}</Text><Text style={{ color: colors.textMuted, fontSize: 10, lineHeight: 12 }}>▼</Text></Pressable></View>
      <Pressable style={[styles.picker, { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }]} onPress={() => setPicker({ type: 'zone', index })}><Text numberOfLines={1} style={{ flex: 1 }}>{block.zone || 'Scegli zona'}</Text><Text style={{ color: colors.textMuted, fontSize: 10, lineHeight: 12 }}>▼</Text></Pressable>
      <View style={styles.estimated}><Text style={styles.estimatedText}>Tempo fase stimato: {formatDuration((block.children || []).length ? (block.children || []).reduce((sum, child) => sum + (estimateSeconds(child) || 0), 0) : estimateSeconds(block))}</Text></View>
      <TextInput value={block.notes} onChangeText={(value) => updateBlockField(index, 'notes', value)} style={[styles.input, styles.area]} multiline placeholder="Recupero, tecnica e istruzioni" />
      <Pressable onPress={() => addChild(index)}><Text style={styles.addLink}>+ Aggiungi sottofase</Text></Pressable>
      {(block.children || []).map((child, childIndex) => <View key={childIndex} style={{ borderLeftWidth: 3, borderLeftColor: colors.primary, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm, backgroundColor: colors.surface }}>
        <View style={styles.blockHeader}><Text style={styles.childNumber}>{`${index + 1}.${childIndex + 1}`}</Text><Pressable style={[styles.picker, styles.type]} onPress={() => setPicker({ type: 'phase', index, childIndex })}><Text>{child.type || 'Scegli fase'}</Text></Pressable><Pressable onPress={() => removeChild(index, childIndex)}><Text style={styles.remove}>Elimina</Text></Pressable></View>
        <View style={styles.row}><ValuePicker value={child.repeats} field="serie" label="Serie" onChange={(value) => updateChild(index, childIndex, 'repeats', value)} style={styles.small} /><Text style={styles.x}>x</Text><ValuePicker value={child.value} unit={child.unit} label="Valore" onChange={(value) => updateChild(index, childIndex, 'value', value)} style={styles.medium} /><Pressable style={[styles.picker, styles.medium]} onPress={() => setPicker({ type: 'unit', index, childIndex })}><Text>{child.unit || 'Unità'}</Text></Pressable></View>
        <Pressable style={styles.picker} onPress={() => setPicker({ type: 'zone', index, childIndex })}><Text>{child.zone || 'Scegli zona'}</Text></Pressable>
        <View style={styles.estimated}><Text style={styles.estimatedText}>Tempo sottofase: {formatDuration(estimateSeconds(child))}</Text></View>
        <TextInput value={child.notes} onChangeText={(value) => updateChild(index, childIndex, 'notes', value)} style={[styles.input, styles.area]} multiline placeholder="Recupero, tecnica e istruzioni" />
      </View>)}
    </View>)}
    <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={saving}><Text style={styles.cancelText}>Annulla</Text></Pressable><Pressable style={styles.button} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Salva allenamento</Text>}</Pressable></View>
    <Modal visible={Boolean(picker)} transparent animationType="fade" onRequestClose={() => setPicker(null)}><Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}><View style={styles.modalCard}>{picker?.type === 'phase' && PHASES.map((item) => <Pressable key={item} style={styles.option} onPress={() => { picker.childIndex === undefined ? updateBlock(picker.index, 'type', item) : updateChild(picker.index, picker.childIndex, 'type', item); setPicker(null); }}><Text>{item}</Text></Pressable>)}{picker?.type === 'unit' && UNITS.map((item) => <Pressable key={item} style={styles.option} onPress={() => { picker.childIndex === undefined ? updateBlock(picker.index, 'unit', item) : updateChild(picker.index, picker.childIndex, 'unit', item); setPicker(null); }}><Text>{item === 'm' ? 'Metri' : item === 'km' ? 'Chilometri' : 'Minuti'}</Text></Pressable>)}{picker?.type === 'zone' && zoneOptions.map((item) => <Pressable key={item} style={styles.option} onPress={() => { picker.childIndex === undefined ? updateBlock(picker.index, 'zone', item) : updateChild(picker.index, picker.childIndex, 'zone', item); setPicker(null); }}><Text>{item}</Text></Pressable>)}</View></Pressable></Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface }, picker: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface, justifyContent: 'center', marginBottom: spacing.xs }, calculated: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.primaryLight }, calculatedText: { color: colors.primary, fontWeight: '700' }, estimated: { paddingVertical: spacing.xs }, estimatedText: { color: colors.primary, fontSize: 12, fontWeight: '700' }, area: { minHeight: 68, textAlignVertical: 'top' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, half: { flex: 1 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm }, addLink: { color: colors.primary, fontWeight: '700' }, block: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surfaceAlt, marginBottom: spacing.sm }, blockHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, number: { width: 22, color: colors.primary, fontWeight: '800' }, type: { flex: 1 }, small: { width: 58 }, medium: { flex: 1 }, x: { fontWeight: '700', color: colors.textMuted }, remove: { color: colors.danger, fontSize: 12, fontWeight: '700' }, actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }, cancelButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }, cancelText: { color: colors.text, fontWeight: '700' }, button: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700' }, modalOverlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: spacing.xl }, modalCard: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' }, option: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
});