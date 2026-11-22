import React, { useMemo, useState } from 'react';
import { Switch } from 'react-native';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import ValuePicker from '../components/ValuePicker';
import DraggableList, { moveItem } from '../components/DraggableList';
import ReorderHandle from '../components/ReorderHandle';
import { Ionicons } from '@expo/vector-icons';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';

const addDays = (value, days) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + Number(days || 0)); return date.toISOString().slice(0, 10); };
let exerciseSeq = 0;
const newExercise = (fields = {}) => ({ nome: '', serie: '', ripetizioni: '', recupero: '', descrizione: '', note: '', ...fields, key: `ex${Date.now()}-${exerciseSeq += 1}` });
const createDay = (index, data = '', daysAfter = index === 0 ? 0 : 2) => ({ data, daysAfter, note: '', esercizi: [newExercise()], index });
const distributedDate = (start, index, count) => addDays(start, Math.floor((index * 7) / Math.max(1, count)));

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const WEEKDAY_KEYS = { lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6, dom: 7 };
// "Lunedi, Mercoledi" (profilo atleta) -> [1, 3]
const parseWeekdays = (value) => [...new Set(String(value || '').split(',').map((item) => WEEKDAY_KEYS[item.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3)]).filter(Boolean))].sort();
const isoWeekday = (value) => { const day = new Date(`${value}T12:00:00`).getDay(); return day === 0 ? 7 : day; };
// Stessa regola del server: i giorni della scheda si susseguono sui giorni disponibili, max un ciclo a settimana
export function autoSchedule(start, end, weekdays, dayCount) {
  const out = [];
  if (!start || !end || !weekdays.length || !dayCount) return out;
  const cap = Math.min(dayCount, weekdays.length);
  let next = 0; let weekKey = null; let inWeek = 0;
  for (let day = start; day <= end && out.length < 400; day = addDays(day, 1)) {
    const weekday = isoWeekday(day);
    const monday = addDays(day, -(weekday - 1));
    if (monday !== weekKey) { weekKey = monday; inWeek = 0; }
    if (!weekdays.includes(weekday) || inWeek >= cap) continue;
    out.push({ data: day, giorno: next });
    next = (next + 1) % dayCount;
    inWeek += 1;
  }
  return out;
}

export default function StrengthSheetEditorScreen({ route, navigation }) {
  const { targetUserId, selectedAthlete } = useAthlete();
  // Programmazione automatica sui giorni di allenamento indicati dall'atleta nel profilo
  const profileDays = parseWeekdays(selectedAthlete?.giorni_allenamento);
  const [auto, setAuto] = useState(!route.params?.editSheet && profileDays.length > 0);
  const [weekdays, setWeekdays] = useState(profileDays);
  const toggleWeekday = (day) => setWeekdays((current) => (current.includes(day) ? current.filter((x) => x !== day) : [...current, day].sort()));
  // Modifica di una scheda gia' assegnata (dal dettaglio scheda): stessi campi, salvataggio con PUT
  const editSheet = route.params?.editSheet || null;
  const isEdit = !!editSheet;
  const [nome, setNome] = useState(editSheet?.nome || '');
  const [datainizio, setDatainizio] = useState(editSheet ? String(editSheet.datainizio || '').slice(0, 10) : (route.params?.date || ''));
  const [datafine, setDatafine] = useState(editSheet ? String(editSheet.datafine || '').slice(0, 10) : '');
  const [giorni, setGiorni] = useState(() => (editSheet
    ? editSheet.giorni.map((day, index) => ({
      schedaid: day.schedaid, nomeGiorno: day.nome, data: '', daysAfter: 0, note: day.note || '', index,
      esercizi: day.esercizi.map((exercise) => newExercise({
        esercizioid: exercise.esercizioid, nome: exercise.nome || '', serie: exercise.serie ?? '', ripetizioni: exercise.ripetizioni ?? '',
        recupero: exercise.recupero ?? '', descrizione: exercise.descrizione ?? '', note: exercise.note ?? '', videoUrl: exercise.legacy_video_url || null,
      })),
    }))
    : [createDay(0, route.params?.date || '')]));
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
  const addExercise = (dayIndex) => setGiorni((current) => current.map((day, i) => i === dayIndex ? { ...day, esercizi: [...day.esercizi, newExercise()] } : day));
  const removeExercise = (dayIndex, exerciseIndex) => setGiorni((current) => current.map((day, i) => i === dayIndex ? { ...day, esercizi: day.esercizi.filter((_, j) => j !== exerciseIndex) } : day));
  const reorderExercise = (dayIndex, from, to) => {
    setExerciseSearch({ dayIndex: null, exerciseIndex: null, query: '', results: [] });
    setGiorni((current) => current.map((day, i) => (i === dayIndex ? { ...day, esercizi: moveItem(day.esercizi, from, to) } : day)));
  };

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
  const preview = useMemo(() => (auto ? autoSchedule(datainizio, datafine, weekdays, giorni.length) : []), [auto, datainizio, datafine, weekdays, giorni.length]);
  const saveEdit = async () => {
    if (!nome.trim() || !datafine) return Alert.alert('Errore', 'Inserisci nome e data di scadenza');
    if (datainizio && datafine < datainizio) return Alert.alert('Errore', 'La data scadenza deve essere successiva alla data inizio');
    setSaving(true);
    try {
      const { data } = await api.put('/calendar/strength-sheets', {
        schedaIds: editSheet.giorni.map((day) => day.schedaid),
        nome: nome.trim(),
        datafine,
        giorni: giorni.map((day) => ({
          schedaid: day.schedaid,
          note: day.note,
          esercizi: day.esercizi.filter((exercise) => exercise.nome.trim()).map(({ key, ...exercise }) => exercise),
        })),
      });
      Alert.alert('Scheda aggiornata', data?.message || 'Modifiche salvate');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare le modifiche');
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (isEdit) return saveEdit();
    if (!nome.trim() || !datainizio || !datafine || (!auto && !giorni.some((day) => day.data))) return Alert.alert('Errore', 'Inserisci nome scheda, data inizio e data scadenza');
    if (auto && !weekdays.length) return Alert.alert('Errore', 'Scegli i giorni della settimana in cui l\'atleta si allena');
    if (datafine < datainizio) return Alert.alert('Errore', 'La data scadenza deve essere successiva alla data inizio');
    setSaving(true);
    try {
      const payloadDays = giorni.map((day) => ({ ...day, esercizi: day.esercizi.map(({ key, ...exercise }) => exercise) }));
      const { data } = await api.post('/calendar/strength-sheets', { utenteId: targetUserId, nome: nome.trim(), dataInizio: datainizio, datafine, giorni: payloadDays, ...(auto ? { programmazione: 'auto', giorniSettimana: weekdays } : {}) });
      if (auto) Alert.alert('Scheda creata', `${data?.occorrenze || 0} allenamenti inseriti in calendario sui giorni scelti.`);
      navigation.goBack();
    }
    catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile creare la scheda'); }
    finally { setSaving(false); }
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={typography.h1}>{isEdit ? 'Modifica scheda' : 'Nuova scheda pesistica'}</Text>
    {isEdit && <Text style={styles.editHint}>Le modifiche valgono per gli allenamenti in programma da domani in poi; quelli già svolti restano com'erano.</Text>}
    <Text style={styles.label}>Nome scheda</Text><TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Nome scheda" />
    {isEdit
      ? <Text style={styles.label}>Inizio scheda: {datainizio ? datainizio.split('-').reverse().join('/') : '—'}{editSheet.programmazione === 'auto' ? ' · programmazione automatica' : ''}</Text>
      : <><Text style={styles.label}>Data inizio scheda</Text><DateField value={datainizio} onChange={updateStartDate} placeholder="Seleziona data inizio" /></>}
    <Text style={styles.label}>Data scadenza scheda</Text><DateField value={datafine} onChange={setDatafine} placeholder="Seleziona scadenza" />
    {!isEdit && <View style={styles.autoCard}>
      <View style={styles.autoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.autoTitle}>Programmazione automatica</Text>
          <Text style={styles.autoHint}>{profileDays.length ? `Giorni indicati da ${selectedAthlete?.nome || 'l\'atleta'}: ${profileDays.map((d) => WEEKDAY_LABELS[d - 1]).join(', ')}` : 'L\'atleta non ha indicato i giorni nel profilo: sceglili tu.'}</Text>
        </View>
        <Switch value={auto} onValueChange={setAuto} trackColor={{ true: colors.primary }} />
      </View>
      {auto && (
        <>
          <View style={styles.weekdays}>
            {WEEKDAY_LABELS.map((label, index) => {
              const active = weekdays.includes(index + 1);
              return (
                <Pressable key={label} onPress={() => toggleWeekday(index + 1)} style={[styles.weekday, active && styles.weekdayActive]}>
                  <Text style={[styles.weekdayText, active && styles.weekdayTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.autoHint}>I giorni della scheda si susseguono sui giorni scelti (max {Math.min(giorni.length, weekdays.length || giorni.length)} a settimana), dalla data di inizio alla scadenza.</Text>
          {preview.length > 0 && (
            <View style={styles.preview}>
              <Text style={styles.previewTitle}>{preview.length} allenamenti in calendario · prime settimane:</Text>
              {preview.slice(0, 10).map((entry) => (
                <Text key={entry.data} style={styles.previewRow}>
                  {new Date(`${entry.data}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' })} · Giorno {entry.giorno + 1}
                </Text>
              ))}
              {preview.length > 10 && <Text style={styles.previewRow}>…</Text>}
            </View>
          )}
        </>
      )}
    </View>}
    {giorni.map((day, dayIndex) => <View key={dayIndex} style={styles.dayCard}>
      <Text style={typography.h2}>{day.nomeGiorno || `Giorno ${dayIndex + 1}`}</Text>
      {!auto && !isEdit && <><Text style={styles.label}>Data calcolata</Text><DateField value={day.data} onChange={(value) => updateDay(dayIndex, 'data', value)} /></>}
      {!auto && !isEdit && dayIndex > 0 && <><Text style={styles.label}>Dopo quanti giorni dal giorno precedente?</Text><TextInput value={String(day.daysAfter)} onChangeText={(value) => updateDayInterval(dayIndex, value)} keyboardType="numeric" style={styles.input} placeholder="Giorni" /></>}
      <Text style={styles.label}>Note giornata</Text><TextInput value={day.note} onChangeText={(value) => updateDay(dayIndex, 'note', value)} style={styles.input} placeholder="Obiettivo del giorno" />
      {day.esercizi.length > 1 && <Text style={styles.dragHint}>Trascina ≡ (o usa le frecce) per cambiare l'ordine degli esercizi</Text>}
      <DraggableList
        data={day.esercizi}
        keyExtractor={(exercise) => exercise.key}
        onReorder={(from, to) => reorderExercise(dayIndex, from, to)}
        renderItem={({ item: exercise, index: exerciseIndex, handleProps, moveUp, moveDown, dragging }) => <View style={[styles.exercise, styles.exerciseRow, dragging && styles.exerciseDragging]}>
        <ReorderHandle handleProps={handleProps} moveUp={moveUp} moveDown={moveDown} />
        <View style={{ flex: 1 }}>
        <View style={styles.exerciseTop}><Text style={styles.exerciseNumber}>{exerciseIndex + 1}</Text><View style={{ flex: 1 }}>
<TextInput value={exercise.nome} onFocus={() => setExerciseSearch({ dayIndex, exerciseIndex, query: exercise.nome || '', results: [] })} onChangeText={(value) => updateExerciseName(dayIndex, exerciseIndex, value)} style={styles.input} placeholder="Cerca esercizio o scrivi manualmente" /></View><Pressable onPress={() => removeExercise(dayIndex, exerciseIndex)} hitSlop={8} style={styles.removeBtn} accessibilityLabel="Elimina esercizio"><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable></View>
        {exerciseSearch.dayIndex === dayIndex && exerciseSearch.exerciseIndex === exerciseIndex && exerciseSearch.results.map((result) => <Pressable key={result.id} style={styles.suggestion} onPress={() => selectExercise(dayIndex, exerciseIndex, result)}><Text style={styles.suggestionText}>{result.nome}</Text></Pressable>)}
        <View style={styles.row}><ValuePicker value={exercise.serie} field="serie" label="Serie" onChange={(value) => updateExercise(dayIndex, exerciseIndex, 'serie', value)} style={styles.small} /><ValuePicker value={exercise.ripetizioni} field="ripetizioni" label="Rip" onChange={(value) => updateExercise(dayIndex, exerciseIndex, 'ripetizioni', value)} style={styles.small} /><TextInput value={exercise.recupero} onChangeText={(value) => updateExercise(dayIndex, exerciseIndex, 'recupero', value)} style={[styles.input, styles.medium]} placeholder="Recupero" /></View>
        <TextInput value={exercise.descrizione} onChangeText={(value) => updateExercise(dayIndex, exerciseIndex, 'descrizione', value)} style={styles.input} placeholder="Descrizione" />
        </View>
      </View>}
      />
<Pressable onPress={() => addExercise(dayIndex)}><Text style={styles.addLink}>+ Aggiungi esercizio</Text></Pressable>
    </View>)}
    {!isEdit && giorni.length < 7 && <Pressable style={styles.addDay} onPress={addDay}><Text style={styles.addDayText}>+ Aggiungi giorno ({giorni.length}/7)</Text></Pressable>}
    <View style={styles.actions}><Pressable style={styles.cancel} onPress={() => navigation.goBack()} disabled={saving}><Text>Annulla</Text></Pressable><Pressable style={styles.save} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{isEdit ? 'Salva modifiche' : 'Salva scheda'}</Text>}</Pressable></View>
  </ScrollView>;
}

const styles = StyleSheet.create({ editHint: { ...typography.caption, marginTop: spacing.xs, color: colors.primary }, dragHint: { ...typography.caption, marginTop: spacing.sm }, exerciseRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }, exerciseDragging: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight }, exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, exerciseNumber: { width: 20, fontWeight: '800', color: colors.primary, textAlign: 'center' }, removeBtn: { padding: 6 }, autoCard: { marginTop: spacing.lg, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md }, autoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, autoTitle: { fontSize: 15, fontWeight: '800', color: colors.primary }, autoHint: { ...typography.caption, marginTop: 4 }, weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm }, weekday: { borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface }, weekdayActive: { backgroundColor: colors.primary }, weekdayText: { color: colors.primary, fontWeight: '700' }, weekdayTextActive: { color: '#fff' }, preview: { marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm }, previewTitle: { fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 4 }, previewRow: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' }, screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, paddingBottom: spacing.xxl }, label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs }, dayCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg }, exercise: { backgroundColor: colors.surfaceAlt, padding: spacing.sm, borderRadius: radius.sm, marginTop: spacing.sm }, suggestion: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.sm }, suggestionText: { color: colors.text, fontWeight: '600' }, row: { flexDirection: 'row', gap: spacing.xs }, small: { flex: 1, minWidth: 64 }, medium: { flex: 2, minWidth: 0 }, addLink: { color: colors.primary, fontWeight: '700', marginTop: spacing.sm }, addDay: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg }, addDayText: { color: colors.primary, fontWeight: '700' }, actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }, cancel: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }, save: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' }, saveText: { color: '#fff', fontWeight: '700' } });