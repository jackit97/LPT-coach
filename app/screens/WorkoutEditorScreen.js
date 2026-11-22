import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import RpeSelector from '../components/RpeSelector';
import OptionPicker from '../components/OptionPicker';
import { useAthlete } from '../context/AthleteContext';
import DraggableList, { moveItem } from '../components/DraggableList';
import ReorderHandle from '../components/ReorderHandle';
import { colors, spacing, radius, typography, workoutTypeColors } from '../theme';
import { trimpFromRpe } from '../utils/endurance';

const TYPES = [
  { key: 'forza', label: 'Forza' },
  { key: 'mobilita', label: 'Mobilità' },
  { key: 'funzionale', label: 'Funzionale' },
];

let keySeq = 0;
const withKey = (exercise) => ({ ...exercise, _key: `k${Date.now()}-${keySeq += 1}` });

export default function WorkoutEditorScreen({ route, navigation }) {
  const { targetUserId } = useAthlete();
  // Si puo' aprire con l'oggetto workout (vecchio flusso) o solo con workoutId (dal dettaglio)
  const editId = route.params?.workout?.workout_id || route.params?.workoutId || null;
  const isEdit = !!editId;
  const [existing, setExisting] = useState(route.params?.workout || null);

  const [data, setData] = useState(route.params?.date || new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState(route.params?.sport === 'funzionale' ? 'funzionale' : 'forza');
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState(route.params?.coachNote || '');
  const [durataMinuti, setDurataMinuti] = useState('');
  const [rpePianificato, setRpePianificato] = useState('');
  const [esercizi, setEsercizi] = useState([]);
  const [exerciseSearch, setExerciseSearch] = useState({ index: null, query: '', results: [] });
  const [saving, setSaving] = useState(false);
  // Modalita' libreria: allenamento standard senza atleta ne' data (creazione o modifica di un template)
  const libraryTemplateId = route.params?.libraryTemplateId || null;
  const libraryMode = !!route.params?.libraryMode || !!libraryTemplateId;
  const [loadingWorkout, setLoadingWorkout] = useState(isEdit || !!libraryTemplateId);

  useEffect(() => {
    if (!libraryTemplateId) return;
    api.get(`/workouts/templates/${libraryTemplateId}`)
      .then(({ data: template }) => {
        setTipo(template.tipo === 'funzionale' ? 'funzionale' : 'forza');
        setTitolo(template.nometemplate || '');
        setDescrizione(template.notegenerali || '');
        const seconds = Number(template.durata_secondi ?? (Number(template.durata_minuti) || 0) * 60);
        setDurataMinuti(seconds ? String(Math.round(seconds / 60)) : '');
        setRpePianificato(template.rpe_pianificato ? String(template.rpe_pianificato) : '');
        setEsercizi((template.esercizi || []).map((e) => withKey({
          nome: e.nomeesercizio, serie: e.serie ?? '', ripetizioni: e.ripetizioni ?? '', carico: e.carico ?? '',
          recupero: e.recupero ?? '', note: e.descrizione ?? '', video_url: e.videourl || '',
        })));
      })
      .catch(() => Alert.alert('Errore', 'Impossibile caricare l\'allenamento della libreria'))
      .finally(() => setLoadingWorkout(false));
  }, [libraryTemplateId]);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/calendar/${editId}`)
      .then(({ data: full }) => {
        setExisting(full);
        setData(String(full.data).slice(0, 10));
        setTipo(full.tipo || 'forza');
        setTitolo(full.titolo || '');
        setDescrizione(full.descrizione || '');
        const seconds = Number(full.durata_secondi ?? (Number(full.durata_minuti) || 0) * 60);
        setDurataMinuti(seconds ? String(Math.round(seconds / 60)) : '');
        setRpePianificato(full.rpe_pianificato ? String(full.rpe_pianificato) : '');
        setEsercizi((full.esercizi || []).map((e) => withKey({ ...e })));
      })
      .catch(() => Alert.alert('Errore', 'Impossibile caricare il workout'))
      .finally(() => setLoadingWorkout(false));
  }, [isEdit, editId]);

  const plannedTrimp = durataMinuti ? trimpFromRpe(durataMinuti, rpePianificato) : 0;

  // Video tutorial del coach da collegare agli esercizi
  const [videos, setVideos] = useState([]);
  useEffect(() => { api.get('/videos').then(({ data }) => setVideos(data || [])).catch(() => setVideos([])); }, []);
  const videoOptions = [
    { value: '', label: 'Nessun video (usa quello con lo stesso nome, se c\'è)' },
    ...videos.map((video) => ({ value: video.videourl, label: video.titolo })),
  ];

  const addExercise = () => setEsercizi((prev) => [...prev, withKey({ nome: '', serie: '', ripetizioni: '', carico: '', recupero: '', note: '' })]);
  const reorderExercise = (from, to) => { setExerciseSearch({ index: null, query: '', results: [] }); setEsercizi((prev) => moveItem(prev, from, to)); };
  const updateExercise = (idx, field, value) => {
    setEsercizi((prev) => prev.map((ex, i) => (i === idx ? { ...ex, [field]: value } : ex)));
  };
  const removeExercise = (idx) => setEsercizi((prev) => prev.filter((_, i) => i !== idx));

  useEffect(() => {
    if (exerciseSearch.index === null || exerciseSearch.query.trim().length < 2) {
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
  }, [exerciseSearch.index, exerciseSearch.query]);

  const updateExerciseName = (idx, value) => {
    updateExercise(idx, 'nome', value);
    setExerciseSearch({ index: idx, query: value, results: [] });
  };

  const selectExercise = (idx, exercise) => {
    updateExercise(idx, 'nome', exercise.nome);
    setExerciseSearch({ index: null, query: '', results: [] });
  };

  const saveToLibrary = async () => {
    if (!titolo.trim()) return Alert.alert('Errore', 'Il titolo è richiesto');
    setSaving(true);
    try {
      const payload = {
        nomeTemplate: titolo.trim(),
        noteGenerali: descrizione || null,
        tipo,
        durataMinuti: durataMinuti ? Number(durataMinuti) : null,
        rpePianificato: rpePianificato ? Number(rpePianificato) : null,
        esercizi: esercizi.filter((e) => e.nome).map((e) => ({
          nome: e.nome, serie: e.serie, ripetizioni: e.ripetizioni, carico: e.carico, recupero: e.recupero,
          descrizione: e.note, videoUrl: e.video_url,
        })),
      };
      if (libraryTemplateId) await api.put(`/workouts/templates/${libraryTemplateId}`, payload);
      else await api.post('/workouts/templates', payload);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile salvare in libreria');
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    if (libraryMode) return saveToLibrary();
    if (!titolo || !data) return Alert.alert('Errore', 'Titolo e data sono richiesti');
    setSaving(true);
    try {
      const payload = {
        utenteId: existing?.utenteid || route.params?.utenteId || targetUserId,
        data,
        tipo,
        titolo,
        descrizione,
        durataMinuti: durataMinuti ? Number(durataMinuti) : null,
        rpePianificato: rpePianificato ? Number(rpePianificato) : null,
        esercizi: esercizi.filter((e) => e.nome).map(({ _key, ...e }) => e),
      };

      let workoutId = editId;
      if (isEdit) {
        await api.put(`/calendar/${workoutId}`, payload);
        await api.put(`/calendar/${workoutId}/exercises`, { esercizi: payload.esercizi });
      } else {
        const { data: created } = await api.post('/calendar', payload);
        workoutId = created.workout_id;
      }
      navigation.replace('WorkoutDetail', { workoutId });
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile salvare il workout');
    } finally {
      setSaving(false);
    }
  };

  if (loadingWorkout) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h1}>{libraryMode ? (libraryTemplateId ? 'Modifica allenamento' : 'Nuovo allenamento in libreria') : isEdit ? 'Modifica workout' : 'Nuovo workout'}</Text>
      {libraryMode && <Text style={styles.libraryHint}>Allenamento standard: lo salvi in libreria e poi lo assegni a uno o più atleti.</Text>}

      {!libraryMode && (
        <>
          <Text style={styles.fieldLabel}>Data</Text>
          <DateField value={data} onChange={setData} style={styles.dateField} />
        </>
      )}

      <Text style={styles.fieldLabel}>Tipo</Text>
      <View style={styles.chipsRow}>
        {TYPES.map((t) => (
          <Pressable key={t.key} onPress={() => setTipo(t.key)} style={[styles.chip, tipo === t.key && { backgroundColor: workoutTypeColors[t.key] + '22', borderColor: workoutTypeColors[t.key] }]}>
            <Text style={[styles.chipText, tipo === t.key && { color: workoutTypeColors[t.key] }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Titolo</Text>
      <TextInput value={titolo} onChangeText={setTitolo} style={styles.input} placeholder="Titolo" />

      <Text style={styles.fieldLabel}>Descrizione</Text>
      <TextInput value={descrizione} onChangeText={setDescrizione} style={[styles.input, styles.textArea]} multiline placeholder="Descrizione" />

      <Text style={styles.fieldLabel}>Durata (min)</Text>
      <TextInput value={durataMinuti} onChangeText={setDurataMinuti} keyboardType="numeric" style={styles.input} placeholder="Durata (min)" />

      <Text style={styles.fieldLabel}>Intensità pianificata (RPE)</Text>
      <RpeSelector value={rpePianificato} onChange={setRpePianificato} />
      <View style={styles.loadPreview}>
        <Text style={styles.loadPreviewLabel}>Carico stimato</Text>
        <Text style={styles.loadPreviewValue}>{plannedTrimp ? `${plannedTrimp} TRIMP` : '—'}</Text>
        <Text style={styles.loadPreviewHint}>Durata × intensità: entra nel carico acuto/cronico come gli allenamenti endurance</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={typography.h3}>Esercizi</Text>
        </View>

        {esercizi.length > 1 && <Text style={styles.dragHint}>Trascina ≡ (o usa le frecce) per cambiare l'ordine</Text>}
        <DraggableList
          data={esercizi}
          keyExtractor={(ex) => ex._key}
          onReorder={reorderExercise}
          renderItem={({ item: ex, index: idx, handleProps, moveUp, moveDown, dragging }) => (
          <View style={[styles.exerciseCard, styles.exerciseRow, dragging && styles.exerciseDragging]}>
            <ReorderHandle handleProps={handleProps} moveUp={moveUp} moveDown={moveDown} />
            <View style={{ flex: 1 }}>
            <View style={styles.exerciseCardHeader}>
              <TextInput
                value={ex.nome}
                onFocus={() => setExerciseSearch({ index: idx, query: ex.nome || '', results: [] })}
                onChangeText={(v) => updateExerciseName(idx, v)}
                placeholder="Nome esercizio"
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable onPress={() => removeExercise(idx)} style={styles.removeBtn}><Text style={styles.removeBtnText}>✕</Text></Pressable>
            </View>
            {exerciseSearch.index === idx && exerciseSearch.results.map((exercise) => (
              <Pressable key={exercise.id} style={styles.exerciseSuggestion} onPress={() => selectExercise(idx, exercise)}>
                <Text style={styles.exerciseSuggestionText}>{exercise.nome}</Text>
              </Pressable>
            ))}
            <View style={styles.row}>
              <TextInput value={String(ex.serie ?? '')} onChangeText={(v) => updateExercise(idx, 'serie', v)} placeholder="Serie" keyboardType="numeric" style={[styles.input, styles.quarter]} />
              <TextInput value={String(ex.ripetizioni ?? '')} onChangeText={(v) => updateExercise(idx, 'ripetizioni', v)} placeholder="Rip" style={[styles.input, styles.quarter]} />
              <TextInput value={String(ex.carico ?? '')} onChangeText={(v) => updateExercise(idx, 'carico', v)} placeholder="Carico" style={[styles.input, styles.quarter]} />
              <TextInput value={String(ex.recupero ?? '')} onChangeText={(v) => updateExercise(idx, 'recupero', v)} placeholder="Recupero" style={[styles.input, styles.quarter]} />
            </View>
            <TextInput value={ex.note ?? ''} onChangeText={(v) => updateExercise(idx, 'note', v)} placeholder="Note" style={styles.input} />
            <OptionPicker
              title="Video tutorial"
              value={ex.video_url || ''}
              options={videoOptions}
              onChange={(value) => updateExercise(idx, 'video_url', value)}
              style={styles.videoPicker}
              textStyle={styles.videoPickerText}
              renderLabel={(option) => `🎬 ${option?.value ? option.label : 'Video: automatico'}`}
            />
            </View>
          </View>
          )}
        />
        <Pressable style={styles.addExerciseBtn} onPress={addExercise}><Text style={styles.addExerciseText}>+ Aggiungi esercizio</Text></Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={saving}>
          <Text style={styles.cancelButtonText}>Annulla</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>{libraryMode ? 'Salva in libreria' : isEdit ? 'Salva modifiche' : 'Crea workout'}</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addExerciseBtn: { marginTop: spacing.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', backgroundColor: colors.primaryLight },
  addExerciseText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  dragHint: { ...typography.caption, marginBottom: spacing.xs },
  exerciseRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  exerciseDragging: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  libraryHint: { ...typography.caption, marginTop: spacing.xs, color: colors.primary },
  screen: { flex: 1, backgroundColor: colors.bg },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1, minWidth: 0 },
  quarter: { flex: 1, minWidth: 0 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  section: { marginTop: spacing.xl },
  videoPicker: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt, alignSelf: 'flex-start' },
  videoPickerText: { fontSize: 12, fontWeight: '700', color: colors.text },
  loadPreview: { marginTop: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm },
  loadPreviewLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  loadPreviewValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  loadPreviewHint: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  testSection: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addLink: { color: colors.accent, fontWeight: '700' },
  exerciseCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  exerciseCardHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  exerciseSuggestion: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, padding: spacing.sm },
  exerciseSuggestionText: { color: colors.text, fontWeight: '600' },
  removeBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.danger, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xxl, marginBottom: spacing.xxl },
  cancelButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  cancelButtonText: { color: colors.text, fontWeight: '700' },
  primaryButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
});
