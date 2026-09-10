import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import { colors, spacing, radius, typography, workoutTypeColors } from '../theme';

const TYPES = ['forza', 'mobilita'];

export default function WorkoutEditorScreen({ route, navigation }) {
  const existing = route.params?.workout || null;
  const isEdit = !!existing;

  const [data, setData] = useState(existing ? String(existing.data).slice(0, 10) : route.params?.date);
  const [tipo, setTipo] = useState(existing?.tipo || 'forza');
  const [titolo, setTitolo] = useState(existing?.titolo || '');
  const [descrizione, setDescrizione] = useState(existing?.descrizione || '');
  const [durataMinuti, setDurataMinuti] = useState(existing?.durata_minuti ? String(existing.durata_minuti) : '');
  const [rpePianificato, setRpePianificato] = useState(existing?.rpe_pianificato ? String(existing.rpe_pianificato) : '');
  const [esercizi, setEsercizi] = useState([]);
  const [exerciseSearch, setExerciseSearch] = useState({ index: null, query: '', results: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api.get(`/calendar/${existing.workout_id}`).then(({ data: full }) => {
        setEsercizi((full.esercizi || []).map((e) => ({ ...e })));
      });
    }
  }, [isEdit]);

  const addExercise = () => setEsercizi((prev) => [...prev, { nome: '', serie: '', ripetizioni: '', carico: '', recupero: '', note: '' }]);
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

  const onSave = async () => {
    if (!titolo || !data) return Alert.alert('Errore', 'Titolo e data sono richiesti');
    setSaving(true);
    try {
      const payload = {
        utenteId: existing?.utenteid || route.params?.utenteId,
        data,
        tipo,
        titolo,
        descrizione,
        durataMinuti: durataMinuti ? Number(durataMinuti) : null,
        rpePianificato: rpePianificato ? Number(rpePianificato) : null,
        esercizi: esercizi.filter((e) => e.nome),
      };

      let workoutId = existing?.workout_id;
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h1}>{isEdit ? 'Modifica workout' : 'Nuovo workout'}</Text>

      <Text style={styles.fieldLabel}>Data</Text>
      <DateField value={data} onChange={setData} style={styles.dateField} />

      <Text style={styles.fieldLabel}>Tipo</Text>
      <View style={styles.chipsRow}>
        {TYPES.map((t) => (
          <Pressable key={t} onPress={() => setTipo(t)} style={[styles.chip, tipo === t && { backgroundColor: workoutTypeColors[t] + '22', borderColor: workoutTypeColors[t] }]}>
            <Text style={[styles.chipText, tipo === t && { color: workoutTypeColors[t] }]}>{t === 'forza' ? 'Forza' : 'Mobilità'}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Titolo</Text>
      <TextInput value={titolo} onChangeText={setTitolo} style={styles.input} placeholder="Full Body A" />

      <Text style={styles.fieldLabel}>Descrizione</Text>
      <TextInput value={descrizione} onChangeText={setDescrizione} style={[styles.input, styles.textArea]} multiline placeholder="Note generali sul workout" />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Durata (min)</Text>
          <TextInput value={durataMinuti} onChangeText={setDurataMinuti} keyboardType="numeric" style={styles.input} placeholder="60" />
        </View>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>RPE pianificato</Text>
          <TextInput value={rpePianificato} onChangeText={setRpePianificato} keyboardType="numeric" style={styles.input} placeholder="7" />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={typography.h3}>Esercizi</Text>
          <Pressable onPress={addExercise}><Text style={styles.addLink}>+ Aggiungi</Text></Pressable>
        </View>

        {esercizi.map((ex, idx) => (
          <View key={idx} style={styles.exerciseCard}>
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
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.cancelButton} onPress={() => navigation.goBack()} disabled={saving}>
          <Text style={styles.cancelButtonText}>Annulla</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>{isEdit ? 'Salva modifiche' : 'Crea workout'}</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  quarter: { flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  section: { marginTop: spacing.xl },
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
