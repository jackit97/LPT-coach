import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';
import { toISODate } from '../utils/dates';

const PHASES = ['Riscaldamento', 'Attivazione', 'Lavoro', 'Recupero', 'Defaticamento'];
const UNITS = [{ key: 'm', label: 'm' }, { key: 'km', label: 'km' }, { key: 'min', label: 'min' }];
const PRESETS = {
  m: ['100', '200', '300', '400', '500', '600', '800', '1000'],
  km: ['1', '2', '3', '5', '8', '10'],
  min: ['1', '2', '3', '5', '10', '15', '20', '30', '45', '60'],
};
const ZONE_KEYS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'];
const ZONE_COLORS = { Z1: '#8ED1D1', Z2: '#58C86B', Z3: '#F5E832', Z4: '#F4A340', Z5: '#EF4141', Z6: '#A83232', Z7: '#D96BE8' };

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
  if (!Number.isFinite(seconds)) return '--:--';
  const rounded = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function formatDistance(meters) {
  if (!meters) return '--';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function stepLabel(step) {
  const value = step.value ? `${step.value} ${step.unit || ''}` : 'valore da inserire';
  return `${step.repeats || 1} x ${value}`;
}

function Sheet({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.close}>✕</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ label, active, onPress, color }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive, active && color && { backgroundColor: color, borderColor: color }]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function EnduranceWorkoutEditorScreen({ route, navigation }) {
  const workoutId = route.params?.workoutId;
  const isEdit = Boolean(workoutId);
  const { targetUserId } = useAthlete();
  const [date, setDate] = useState(route.params?.date || toISODate(new Date()));
  const [title, setTitle] = useState('');
  const [zone, setZone] = useState('Z2');
  const [duration, setDuration] = useState('45');
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');
  const [rpe, setRpe] = useState('');
  const [blocks, setBlocks] = useState([emptyBlock('Riscaldamento')]);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState({ pace: [] });
  const [stepSheet, setStepSheet] = useState(null);
  const [phaseSheet, setPhaseSheet] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!workoutId) return;
    api.get(`/calendar/${workoutId}`).then(({ data }) => {
      setDate(String(data.data).slice(0, 10)); setTitle(data.titolo || ''); setDuration(String(data.durata_minuti || ''));
      setDescription(data.descrizione || ''); setZone(data.endurance?.zone || 'Z2'); setTarget(data.endurance?.target || '');
      setRpe(data.endurance?.rpe_target ? String(data.endurance.rpe_target) : '');
      if (data.endurance?.steps_json) {
        try {
          setBlocks(JSON.parse(data.endurance.steps_json).map((block) => ({
            ...block,
            unit: block.unit || (block.meters ? 'm' : 'min'),
            value: block.value ?? block.meters ?? '',
            children: Array.isArray(block.children) ? block.children : [],
          })));
        } catch { setBlocks([emptyBlock('Lavoro')]); }
      }
    }).catch(() => Alert.alert('Errore', 'Impossibile caricare l\'allenamento'));
  }, [workoutId]);

  useEffect(() => {
    api.get('/zones', { params: { utenteId: targetUserId } }).then(({ data }) => setZones(data.zones || { pace: [] })).catch(() => {});
  }, [targetUserId]);

  const paceFor = (key) => {
    const selected = (zones.pace || []).find((item) => item.key === key);
    const values = selected ? [parsePace(selected.min), parsePace(selected.max)].filter(Boolean) : [];
    return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
  };

  const estimateSeconds = (step) => {
    const repeats = Number(step.repeats) || 0;
    if (!repeats) return null;
    if (step.unit === 'min') {
      const seconds = parseDurationValue(step.value);
      return seconds ? seconds * repeats : null;
    }
    const value = Number(String(step.value || '').replace(',', '.'));
    const pace = paceFor(step.zone);
    if (!value || !pace) return null;
    return (step.unit === 'km' ? value : value / 1000) * pace * repeats;
  };

  const estimateMeters = (step) => {
    const repeats = Number(step.repeats) || 0;
    if (!repeats) return 0;
    if (step.unit === 'min') {
      const seconds = parseDurationValue(step.value);
      const pace = paceFor(step.zone);
      return seconds && pace ? (seconds / pace) * 1000 * repeats : 0;
    }
    const value = Number(String(step.value || '').replace(',', '.')) || 0;
    return (step.unit === 'km' ? value * 1000 : value) * repeats;
  };

  // Gruppi: le sottofasi vengono ripetute per le serie del blocco padre.
  const leaves = (block) => {
    const mult = Number(block.repeats) || 1;
    return (block.children || []).length ? block.children.map((step) => ({ step, mult })) : [{ step: block, mult: 1 }];
  };
  const blockSeconds = (block) => leaves(block).reduce((sum, { step, mult }) => sum + (estimateSeconds(step) || 0) * mult, 0);
  const blockMeters = (block) => leaves(block).reduce((sum, { step, mult }) => sum + estimateMeters(step) * mult, 0);

  const totalSeconds = blocks.reduce((sum, block) => sum + blockSeconds(block), 0);
  const totalMeters = blocks.reduce((sum, block) => sum + blockMeters(block), 0);
  const zoneSeconds = {};
  blocks.forEach((block) => leaves(block).forEach(({ step, mult }) => {
    const seconds = (estimateSeconds(step) || 0) * mult;
    if (seconds && step.zone) zoneSeconds[step.zone] = (zoneSeconds[step.zone] || 0) + seconds;
  }));

  const updateBlock = (index, field, value) => setBlocks((current) => current.map((block, i) => (i === index ? { ...block, [field]: value } : block)));
  const updateChild = (index, childIndex, field, value) => setBlocks((current) => current.map((block, i) => (i === index
    ? { ...block, children: block.children.map((child, c) => (c === childIndex ? { ...child, [field]: value } : child)) }
    : block)));
  const updateStep = (target, field, value) => (target.childIndex === undefined
    ? updateBlock(target.index, field, value)
    : updateChild(target.index, target.childIndex, field, value));
  const getStep = (target) => {
    const block = target && blocks[target.index];
    if (!block) return null;
    return target.childIndex === undefined ? block : block.children[target.childIndex] || null;
  };

  const addBlock = () => {
    setBlocks((current) => [...current, emptyBlock()]);
    setStepSheet({ index: blocks.length });
  };
  const removeBlock = (index) => setBlocks((current) => current.filter((_, i) => i !== index));
  const duplicateBlock = (index) => setBlocks((current) => [...current.slice(0, index + 1), JSON.parse(JSON.stringify(current[index])), ...current.slice(index + 1)]);
  const addChild = (index) => {
    const childIndex = blocks[index].children.length;
    setBlocks((current) => current.map((block, i) => (i === index ? { ...block, children: [...block.children, emptyBlock('Lavoro')] } : block)));
    setStepSheet({ index, childIndex });
  };
  const removeChild = (index, childIndex) => {
    setStepSheet(null);
    setBlocks((current) => current.map((block, i) => (i === index ? { ...block, children: block.children.filter((_, c) => c !== childIndex) } : block)));
  };

  const save = async () => {
    if (!targetUserId || !date || !title.trim() || !duration) return Alert.alert('Errore', 'Data, titolo e durata sono obbligatori');
    setSaving(true);
    try {
      const calculatedDuration = totalSeconds > 0 ? Math.ceil(totalSeconds / 60) : Number(duration);
      const payload = {
        utenteId: targetUserId, date, title: title.trim(), zone, durationMinutes: calculatedDuration,
        durationSeconds: totalSeconds > 0 ? Math.ceil(totalSeconds) : Number(duration) * 60,
        target, description, rpeTarget: rpe ? Number(rpe) : null,
        stepsJson: blocks.map((block) => ({
          ...block,
          duration: formatDuration(blockSeconds(block)),
          children: (block.children || []).map((child) => ({ ...child, duration: formatDuration(estimateSeconds(child)) })),
        })),
      };
      if (isEdit) await api.put(`/endurance/workouts/${workoutId}`, payload);
      else await api.post('/endurance/workouts', payload);
      if (isEdit) navigation.replace('WorkoutDetail', { workoutId });
      else navigation.goBack();
    } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile creare l\'allenamento'); }
    finally { setSaving(false); }
  };

  const zoneChoices = [...new Set([...(zones.pace || []).map((item) => item.key), ...ZONE_KEYS])];
  const editing = getStep(stepSheet);
  const editingIsGroup = editing && stepSheet.childIndex === undefined && (editing.children || []).length > 0;
  const phaseStep = getStep(phaseSheet);

  const renderStepRow = (step, target, nested) => (
    <Pressable key={`${target.index}-${target.childIndex ?? 'b'}`} style={[styles.stepRow, nested && styles.stepRowNested]} onPress={() => setStepSheet(target)}>
      {nested && <Text style={styles.stepPhase} numberOfLines={1}>{step.type}</Text>}
      <Text style={styles.stepText} numberOfLines={1}>{stepLabel(step)}</Text>
      <View style={[styles.zonePill, { backgroundColor: ZONE_COLORS[step.zone] || colors.surfaceAlt }]}>
        <Text style={styles.zonePillText}>{step.zone || '-'}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput value={title} onChangeText={setTitle} style={styles.titleInput} placeholder="Inserisci un titolo" placeholderTextColor={colors.textMuted} />
        <View style={styles.topRow}>
          <DateField value={date} onChange={setDate} style={{ flex: 1 }} />
          <Pressable style={styles.ghostButton} onPress={() => setDetailsOpen(true)}><Text style={styles.ghostText}>Dettagli</Text></Pressable>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statLabel}>Durata</Text><Text style={styles.statValue}>{totalSeconds ? formatDuration(totalSeconds) : formatDuration(Number(duration) * 60)}</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Distanza</Text><Text style={styles.statValue}>{formatDistance(totalMeters)}</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>RPE</Text><Text style={styles.statValue}>{rpe || '-'}</Text></View>
        </View>
        {totalSeconds > 0 && (
          <View style={styles.zoneBar}>
            {Object.entries(zoneSeconds).map(([key, seconds]) => (
              <View key={key} style={{ flex: seconds, backgroundColor: ZONE_COLORS[key] || colors.primary }} />
            ))}
          </View>
        )}

        {blocks.map((block, index) => {
          const isGroup = (block.children || []).length > 0;
          return (
            <View key={index} style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.number}>{index + 1}</Text>
                <Pressable style={styles.phaseChip} onPress={() => setPhaseSheet({ index })}>
                  <Text style={styles.phaseText} numberOfLines={1}>{block.type || 'Fase'} ▾</Text>
                </Pressable>
                {isGroup && (
                  <Pressable style={styles.repeatChip} onPress={() => setStepSheet({ index })}>
                    <Text style={styles.repeatText}>{block.repeats || 1} serie</Text>
                  </Pressable>
                )}
                <Text style={styles.blockTime}>{formatDuration(blockSeconds(block) || null)}</Text>
                <Pressable onPress={() => duplicateBlock(index)} hitSlop={6}><Text style={styles.icon}>⧉</Text></Pressable>
                <Pressable onPress={() => removeBlock(index)} hitSlop={6}><Text style={[styles.icon, { color: colors.danger }]}>✕</Text></Pressable>
              </View>
              {isGroup
                ? block.children.map((child, childIndex) => renderStepRow(child, { index, childIndex }, true))
                : renderStepRow(block, { index }, false)}
              {!!block.notes && !isGroup && <Text style={styles.noteLine} numberOfLines={2}>{block.notes}</Text>}
              <Pressable onPress={() => addChild(index)}><Text style={styles.addLink}>+ sottofase</Text></Pressable>
            </View>
          );
        })}

        <Pressable style={styles.addBlock} onPress={addBlock}><Text style={styles.addBlockText}>+ Aggiungi blocco</Text></Pressable>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={saving}><Text style={styles.cancelText}>Annulla</Text></Pressable>
        <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salva allenamento</Text>}
        </Pressable>
      </View>

      <Sheet visible={Boolean(editing)} title={editingIsGroup ? 'Serie del blocco' : stepSheet?.childIndex === undefined ? 'Blocco' : 'Sottofase'} onClose={() => setStepSheet(null)}>
        {editing && (
          <View>
            <Text style={styles.label}>Serie</Text>
            <TextInput value={String(editing.repeats ?? '')} onChangeText={(v) => updateStep(stepSheet, 'repeats', v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" style={styles.input} />
            {!editingIsGroup && (
              <>
                <Text style={styles.label}>Unità</Text>
                <View style={styles.chipRow}>
                  {UNITS.map((u) => <Chip key={u.key} label={u.label} active={editing.unit === u.key} onPress={() => updateStep(stepSheet, 'unit', u.key)} />)}
                </View>
                <Text style={styles.label}>Valore {editing.unit === 'min' ? '(minuti o MM:SS)' : ''}</Text>
                <TextInput value={String(editing.value ?? '')} onChangeText={(v) => updateStep(stepSheet, 'value', v)} style={styles.input} placeholder="es. 500" />
                <View style={[styles.chipRow, { marginTop: spacing.sm }]}>
                  {(PRESETS[editing.unit] || PRESETS.m).map((p) => <Chip key={p} label={p} active={String(editing.value) === p} onPress={() => updateStep(stepSheet, 'value', p)} />)}
                </View>
                <Text style={styles.label}>Zona</Text>
                <View style={styles.chipRow}>
                  {zoneChoices.map((z) => <Chip key={z} label={z} active={editing.zone === z} color={ZONE_COLORS[z]} onPress={() => updateStep(stepSheet, 'zone', z)} />)}
                </View>
                <Text style={styles.label}>Note</Text>
                <TextInput value={editing.notes || ''} onChangeText={(v) => updateStep(stepSheet, 'notes', v)} style={[styles.input, styles.area]} multiline placeholder="Recupero, tecnica, istruzioni" />
              </>
            )}
            <View style={styles.sheetActions}>
              {stepSheet.childIndex !== undefined && (
                <Pressable style={styles.dangerButton} onPress={() => removeChild(stepSheet.index, stepSheet.childIndex)}><Text style={styles.dangerText}>Elimina</Text></Pressable>
              )}
              <Pressable style={styles.saveButton} onPress={() => setStepSheet(null)}><Text style={styles.saveText}>Fatto</Text></Pressable>
            </View>
          </View>
        )}
      </Sheet>

      <Sheet visible={Boolean(phaseStep)} title="Fase" onClose={() => setPhaseSheet(null)}>
        <View style={styles.chipRow}>
          {PHASES.map((p) => <Chip key={p} label={p} active={phaseStep?.type === p} onPress={() => { updateStep(phaseSheet, 'type', p); setPhaseSheet(null); }} />)}
        </View>
      </Sheet>

      <Sheet visible={detailsOpen} title="Dettagli allenamento" onClose={() => setDetailsOpen(false)}>
        <Text style={styles.label}>Zona generale</Text>
        <View style={styles.chipRow}>
          {ZONE_KEYS.map((z) => <Chip key={z} label={z} active={zone === z} color={ZONE_COLORS[z]} onPress={() => setZone(z)} />)}
        </View>
        <Text style={styles.label}>Obiettivo</Text>
        <TextInput value={target} onChangeText={setTarget} style={styles.input} placeholder="Soglia, volume, tecnica..." />
        <Text style={styles.label}>RPE obiettivo (1-10)</Text>
        <TextInput value={rpe} onChangeText={setRpe} keyboardType="numeric" style={styles.input} placeholder="7" />
        <Text style={styles.label}>Descrizione</Text>
        <TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.area]} multiline placeholder="Istruzioni generali" />
        <View style={styles.sheetActions}>
          <Pressable style={styles.saveButton} onPress={() => setDetailsOpen(false)}><Text style={styles.saveText}>Fatto</Text></Pressable>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  titleInput: { fontSize: 22, fontWeight: '700', color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  ghostButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 42, justifyContent: 'center', backgroundColor: colors.surface },
  ghostText: { color: colors.text, fontWeight: '600' },
  stats: { flexDirection: 'row', marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stat: { flex: 1, padding: spacing.md },
  statLabel: { ...typography.caption },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  zoneBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: spacing.sm, backgroundColor: colors.surfaceAlt },
  block: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  number: { width: 18, color: colors.textMuted, fontWeight: '700' },
  phaseChip: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, flexShrink: 1 },
  phaseText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  repeatChip: { backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  repeatText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  blockTime: { flex: 1, textAlign: 'right', ...typography.caption },
  icon: { fontSize: 16, color: colors.textMuted, paddingHorizontal: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, marginTop: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.bg },
  stepRowNested: { marginLeft: spacing.lg },
  stepPhase: { fontSize: 12, color: colors.textMuted, width: 84 },
  stepText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  zonePill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, minWidth: 34, alignItems: 'center' },
  zonePillText: { fontSize: 12, fontWeight: '700', color: '#101828' },
  noteLine: { ...typography.caption, marginTop: spacing.xs, marginLeft: spacing.sm },
  addLink: { color: colors.primary, fontWeight: '600', fontSize: 12, marginTop: spacing.sm, marginLeft: spacing.sm },
  addBlock: { marginTop: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  addBlockText: { color: colors.primary, fontWeight: '700' },
  bottomBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  cancelButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.text, fontWeight: '700' },
  saveButton: { flex: 2, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
  dangerButton: { flex: 1, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerText: { color: colors.danger, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: '#0007', justifyContent: 'center', padding: spacing.lg },
  sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sheetTitle: { ...typography.h2 },
  close: { fontSize: 18, color: colors.textMuted },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface },
  area: { minHeight: 68, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipTextActive: { color: '#fff' },
});
