import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Image, useWindowDimensions, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { InlinePlayer } from './VideoPlayer';
import { parseVideo } from '../utils/video';
import { pickExecutionVideo, uploadExecutionVideo, MAX_VIDEO_MB } from '../utils/videoUpload';
import { colors, radius, spacing } from '../theme';

// Popup dell'esercizio: indicazioni del coach (serie, ripetizioni, carico, recupero, note),
// video tutorial e note personali dell'atleta.
// source: 'scheda' (esercizischeda.esercizioid) | 'workout' (calendar_workout_exercises.exercise_id)
// allowExecution: allenamento di forza del calendario -> video di esecuzione e dubbi per il coach.
// valori del programma -> numeri per precompilare le serie ("8-10" -> 9, "60 kg" -> 60)
const plannedReps = (value) => {
  const text = String(value ?? '').toLowerCase();
  if (/\d\s*(s|sec|min)\b|["']|amrap|max/.test(text)) return '';
  const range = text.match(/(\d+)\s*[-–/]\s*(\d+)/);
  if (range) return String(Math.round((Number(range[1]) + Number(range[2])) / 2));
  return (text.match(/\d+/) || [''])[0];
};
const plannedKg = (value) => {
  const text = String(value ?? '').toLowerCase().replace(',', '.');
  if (/%|rpe|rir|corpo libero/.test(text)) return '';
  return (text.match(/\d+(?:\.\d+)?/) || [''])[0];
};
const readSets = (json) => { try { const list = JSON.parse(json || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };
function initialSets(exercise) {
  const saved = readSets(exercise?.serie_eseguite_json);
  if (saved.length) return saved.map((set) => ({ reps: set.reps === null || set.reps === undefined ? '' : String(set.reps), kg: set.kg === null || set.kg === undefined ? '' : String(set.kg) }));
  const count = Math.min(12, Math.max(1, Number(exercise?.serie) || 3));
  return Array.from({ length: count }, () => ({ reps: plannedReps(exercise?.ripetizioni), kg: plannedKg(exercise?.carico) }));
}

export default function ExerciseSheet({ visible, exercise, source, isCoach, onClose, onSaved, allowExecution = false, onExecutionChange, onSetsSaved }) {
  const { width, height } = useWindowDimensions();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);
  // video di esecuzione + dubbi
  const [doubts, setDoubts] = useState('');
  const [doubtsSaved, setDoubtsSaved] = useState(false);
  const [savingDoubts, setSavingDoubts] = useState(false);
  const [execPlaying, setExecPlaying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [execError, setExecError] = useState(null);
  // serie eseguite (carico e ripetizioni reali) -> analisi dell'allenamento
  const [sets, setSets] = useState([]);
  const [setsSaved, setSetsSaved] = useState(false);
  const [savingSets, setSavingSets] = useState(false);
  const [setsError, setSetsError] = useState(null);

  useEffect(() => {
    if (!visible || !exercise) return;
    setNote(exercise.note_atleta || '');
    setSaved(false);
    setPlaying(false);
    setError(null);
    setDoubts(exercise.esecuzione_dubbi || '');
    setDoubtsSaved(false);
    setExecPlaying(false);
    setUploadProgress(null);
    setExecError(null);
    setSets(initialSets(exercise));
    setSetsSaved(!!readSets(exercise.serie_eseguite_json).length);
    setSetsError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, exercise?.esercizioid, exercise?.exercise_id]);

  if (!exercise) return null;
  const id = source === 'scheda' ? exercise.esercizioid : exercise.exercise_id;
  const video = parseVideo(exercise.video_url);
  const coachNotes = [exercise.descrizione, exercise.note].filter((text) => String(text || '').trim());
  const stats = [
    ['Serie', exercise.serie],
    ['Ripetizioni', exercise.ripetizioni],
    ['Carico', exercise.carico],
    ['Recupero', exercise.recupero],
  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
  const cardWidth = Math.min(width - 24, 640);

  const saveNote = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put('/calendar/exercise-notes', { source, id, note });
      setSaved(true);
      onSaved?.(id, data.note_atleta, data.note_atleta_at);
    } catch (e) {
      setError(e?.response?.data?.message || 'Salvataggio non riuscito');
    } finally {
      setSaving(false);
    }
  };

  const execUrl = exercise.esecuzione_video_url || null;
  const trackSets = source === 'workout' && allowExecution;
  const hasSavedSets = readSets(exercise.serie_eseguite_json).length > 0;
  const updateSet = (index, key, value) => { setSets((current) => current.map((set, i) => (i === index ? { ...set, [key]: value.replace(/[^0-9.,]/g, '') } : set))); setSetsSaved(false); };
  const addSet = () => { setSets((current) => [...current, { ...(current[current.length - 1] || { reps: '', kg: '' }) }]); setSetsSaved(false); };
  const removeSet = (index) => { setSets((current) => current.filter((_, i) => i !== index)); setSetsSaved(false); };
  const saveSets = async () => {
    setSavingSets(true);
    setSetsError(null);
    try {
      const { data } = await api.put(`/calendar/exercises/${id}/sets`, { serie: sets.map((set) => ({ reps: set.reps, kg: set.kg })) });
      setSetsSaved(true);
      onSetsSaved?.(id, data.serie_eseguite_json);
    } catch (e) {
      setSetsError(e?.response?.data?.message || 'Salvataggio non riuscito');
    } finally {
      setSavingSets(false);
    }
  };
  const volume = sets.reduce((sum, set) => sum + (Number(String(set.reps).replace(',', '.')) || 0) * (Number(String(set.kg).replace(',', '.')) || 0), 0);

  const saveDoubts = async () => {
    setSavingDoubts(true);
    setExecError(null);
    try {
      const { data } = await api.put(`/reports/exercises/${id}/dubbi`, { dubbi: doubts });
      setDoubtsSaved(true);
      onExecutionChange?.(id, { esecuzione_dubbi: data.dubbi, esecuzione_video_url: data.video_url });
    } catch (e) {
      setExecError(e?.response?.data?.message || 'Salvataggio non riuscito');
    } finally {
      setSavingDoubts(false);
    }
  };

  const uploadVideo = async (camera = false) => {
    setExecError(null);
    try {
      const video = await pickExecutionVideo({ camera });
      if (!video) return;
      setUploadProgress(0);
      const data = await uploadExecutionVideo(id, video, setUploadProgress);
      setExecPlaying(false);
      onExecutionChange?.(id, { esecuzione_dubbi: data.dubbi, esecuzione_video_url: data.video_url });
    } catch (e) {
      setExecError(e?.response?.data?.message || e?.message || 'Caricamento non riuscito');
    } finally {
      setUploadProgress(null);
    }
  };

  const removeVideo = () => {
    Alert.alert('Elimina video', 'Vuoi eliminare il video di esecuzione?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          try {
            const { data } = await api.delete(`/reports/exercises/${id}/video`);
            setExecPlaying(false);
            onExecutionChange?.(id, { esecuzione_dubbi: data.dubbi, esecuzione_video_url: null });
          } catch (e) {
            setExecError(e?.response?.data?.message || 'Eliminazione non riuscita');
          }
        },
      },
    ]);
  };

  const executionPlayer = execUrl ? (
    execPlaying ? <InlinePlayer url={execUrl} aspectRatio={4 / 5} /> : (
      <Pressable style={[styles.poster, { aspectRatio: 16 / 10 }]} onPress={() => setExecPlaying(true)} accessibilityLabel="Guarda il video di esecuzione">
        <View style={styles.posterShade} />
        <View style={[styles.playCircle, { backgroundColor: colors.primary }]}><Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 3 }} /></View>
        <Text style={styles.posterText}>{isCoach ? 'Guarda l\'esecuzione' : 'Il mio video di esecuzione'}</Text>
      </Pressable>
    )
  ) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { width: cardWidth, maxHeight: height - 40 }]}>
          <View style={styles.header}>
            <Ionicons name="barbell" size={22} color={colors.primary} />
            <Text style={styles.title} numberOfLines={2}>{exercise.nome}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Chiudi">
              <Ionicons name="close" size={26} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
            {stats.length > 0 && (
              <View style={styles.stats}>
                {stats.map(([label, value]) => (
                  <View key={label} style={styles.stat}>
                    <Text style={styles.statLabel}>{label}</Text>
                    <Text style={styles.statValue}>{String(value)}</Text>
                  </View>
                ))}
              </View>
            )}

            {trackSets && (
              <>
                <Text style={styles.section}>{isCoach ? 'Serie eseguite dall\'atleta' : 'Serie eseguite'}</Text>
                {isCoach && !hasSavedSets && <Text style={styles.muted}>L'atleta non ha ancora registrato le serie: puoi inserirle tu (es. seduta seguita di persona).</Text>}
                {!isCoach && !hasSavedSets && <Text style={styles.muted}>Precompilate dal programma: correggi carichi e ripetizioni che hai fatto davvero e salva.</Text>}
                <View style={styles.setHeader}>
                  <Text style={[styles.setHeadText, { width: 46 }]}>Serie</Text>
                  <Text style={[styles.setHeadText, { flex: 1 }]}>Ripetizioni</Text>
                  <Text style={[styles.setHeadText, { flex: 1 }]}>Kg</Text>
                  <View style={{ width: 30 }} />
                </View>
                {sets.map((set, index) => (
                  <View key={index} style={styles.setRow}>
                    <Text style={styles.setIndex}>{index + 1}</Text>
                    <TextInput value={set.reps} onChangeText={(value) => updateSet(index, 'reps', value)} keyboardType="numeric" style={styles.setInput} placeholder="Rip" placeholderTextColor={colors.textMuted} accessibilityLabel={`Ripetizioni serie ${index + 1}`} />
                    <TextInput value={set.kg} onChangeText={(value) => updateSet(index, 'kg', value)} keyboardType="decimal-pad" style={styles.setInput} placeholder="Kg" placeholderTextColor={colors.textMuted} accessibilityLabel={`Kg serie ${index + 1}`} />
                    <Pressable onPress={() => removeSet(index)} hitSlop={8} style={styles.setRemove} accessibilityLabel={`Togli serie ${index + 1}`}>
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
                <View style={styles.setFooter}>
                  <Pressable onPress={addSet} style={styles.addSet}><Ionicons name="add" size={16} color={colors.primary} /><Text style={styles.addSetText}>Aggiungi serie</Text></Pressable>
                  {volume > 0 && <Text style={styles.volumeText}>Volume {Math.round(volume).toLocaleString('it-IT')} kg</Text>}
                </View>
                <Pressable style={[styles.saveBtn, (savingSets || setsSaved) && { opacity: 0.7 }]} onPress={saveSets} disabled={savingSets}>
                  {savingSets ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name={setsSaved ? 'checkmark' : 'save-outline'} size={18} color="#fff" />
                      <Text style={styles.saveText}>{setsSaved ? 'Serie salvate' : 'Salva serie'}</Text>
                    </>
                  )}
                </Pressable>
                {!!setsError && <Text style={styles.error}>{setsError}</Text>}
              </>
            )}

            <Text style={styles.section}>Indicazioni del coach</Text>
            {coachNotes.length ? coachNotes.map((text, index) => <Text key={index} style={styles.body}>{text}</Text>)
              : <Text style={styles.muted}>Nessuna indicazione aggiuntiva.</Text>}

            <Text style={styles.section}>Video</Text>
            {video ? (
              playing ? <InlinePlayer url={exercise.video_url} /> : (
                <Pressable style={styles.poster} onPress={() => setPlaying(true)} accessibilityLabel="Guarda il video">
                  {video.thumbnail ? <Image source={{ uri: video.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                  <View style={styles.posterShade} />
                  <View style={styles.playCircle}><Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 3 }} /></View>
                  <Text style={styles.posterText}>Guarda il video</Text>
                </Pressable>
              )
            ) : <Text style={styles.muted}>{isCoach ? 'Nessun video: caricalo in Video tutorial scegliendo questo esercizio.' : 'Il coach non ha ancora caricato un video per questo esercizio.'}</Text>}

            {allowExecution && (isCoach ? (
              (execUrl || exercise.esecuzione_dubbi) ? (
                <>
                  <Text style={styles.section}>Esecuzione dell'atleta</Text>
                  {executionPlayer}
                  {!!exercise.esecuzione_dubbi && (
                    <View style={styles.doubtBox}>
                      <Text style={styles.doubtLabel}>Dubbi</Text>
                      <Text style={styles.body}>{exercise.esecuzione_dubbi}</Text>
                    </View>
                  )}
                </>
              ) : null
            ) : (
              <>
                <Text style={styles.section}>Video esecuzione per il coach</Text>
                {executionPlayer}
                {uploadProgress !== null ? (
                  <View style={styles.progressBox}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.progressText}>Caricamento {Math.round((uploadProgress || 0) * 100)}%</Text>
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round((uploadProgress || 0) * 100)}%` }]} /></View>
                  </View>
                ) : (
                  <View style={styles.execButtons}>
                    {Platform.OS !== 'web' && (
                      <Pressable style={styles.execBtn} onPress={() => uploadVideo(true)}>
                        <Ionicons name="videocam-outline" size={18} color={colors.primary} />
                        <Text style={styles.execBtnText}>Registra</Text>
                      </Pressable>
                    )}
                    <Pressable style={styles.execBtn} onPress={() => uploadVideo(false)}>
                      <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                      <Text style={styles.execBtnText}>{execUrl ? 'Sostituisci video' : 'Carica video'}</Text>
                    </Pressable>
                    {!!execUrl && (
                      <Pressable style={[styles.execBtn, { borderColor: colors.danger, flexGrow: 0 }]} onPress={removeVideo} accessibilityLabel="Elimina video">
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </Pressable>
                    )}
                  </View>
                )}
                {!execUrl && uploadProgress === null && <Text style={styles.muted}>Fai vedere al coach come esegui l'esercizio (max {MAX_VIDEO_MB} MB, meglio 30-60 secondi).</Text>}
                <Text style={[styles.section, { marginTop: spacing.md }]}>Dubbi per il coach</Text>
                <TextInput
                  value={doubts}
                  onChangeText={(value) => { setDoubts(value); setDoubtsSaved(false); }}
                  style={[styles.input, { minHeight: 70 }]}
                  multiline
                  placeholder="Cosa vuoi chiedere al coach su questo esercizio?"
                />
                <Pressable style={[styles.saveBtn, styles.saveBtnOutline, (savingDoubts || doubtsSaved) && { opacity: 0.7 }]} onPress={saveDoubts} disabled={savingDoubts}>
                  {savingDoubts ? <ActivityIndicator color={colors.primary} /> : (
                    <>
                      <Ionicons name={doubtsSaved ? 'checkmark' : 'help-circle-outline'} size={18} color={colors.primary} />
                      <Text style={[styles.saveText, { color: colors.primary }]}>{doubtsSaved ? 'Dubbi salvati' : 'Salva dubbi'}</Text>
                    </>
                  )}
                </Pressable>
                {!!execError && <Text style={styles.error}>{execError}</Text>}
              </>
            ))}

            <Text style={styles.section}>{isCoach ? 'Note dell\'atleta' : 'Le mie note'}</Text>
            {isCoach ? (
              <Text style={exercise.note_atleta ? styles.body : styles.muted}>{exercise.note_atleta || 'L\'atleta non ha ancora scritto note su questo esercizio.'}</Text>
            ) : (
              <>
                <TextInput
                  value={note}
                  onChangeText={(value) => { setNote(value); setSaved(false); }}
                  style={styles.input}
                  multiline
                  placeholder="Carico usato, sensazioni, domande per il coach"
                />
                <Pressable style={[styles.saveBtn, (saving || saved) && { opacity: 0.7 }]} onPress={saveNote} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name={saved ? 'checkmark' : 'save-outline'} size={18} color="#fff" />
                      <Text style={styles.saveText}>{saved ? 'Nota salvata' : 'Salva nota'}</Text>
                    </>
                  )}
                </Pressable>
                {!!error && <Text style={styles.error}>{error}</Text>}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'flex-end', padding: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexGrow: 1, minWidth: 110, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.sm },
  statLabel: { fontSize: 10, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.xs },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.textMuted },
  poster: { aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  posterShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  playCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(220,38,38,0.95)', alignItems: 'center', justifyContent: 'center' },
  posterText: { color: '#fff', fontWeight: '800', marginTop: spacing.sm },
  input: { minHeight: 90, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceAlt, textAlignVertical: 'top', fontSize: 15 },
  saveBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.sm },
  saveText: { color: '#fff', fontWeight: '800' },
  error: { color: colors.danger, marginTop: spacing.xs, fontWeight: '700' },
  execButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.xs },
  execBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.md, flexGrow: 1 },
  execBtnText: { color: colors.primary, fontWeight: '800' },
  saveBtnOutline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  progressBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', gap: 6 },
  progressText: { fontWeight: '800', color: colors.primary },
  progressTrack: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.primary },
  setHeader: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: 4 },
  setHeadText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  setIndex: { width: 46, fontSize: 15, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  setInput: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 8, backgroundColor: colors.surfaceAlt, fontSize: 16, fontWeight: '700', textAlign: 'center', color: colors.text },
  setRemove: { width: 30, alignItems: 'center' },
  setFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  addSet: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  addSetText: { color: colors.primary, fontWeight: '800' },
  volumeText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  doubtBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FEF3C7' },
  doubtLabel: { fontSize: 11, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', marginBottom: 2 },
});
