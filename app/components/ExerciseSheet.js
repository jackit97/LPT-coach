import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { InlinePlayer } from './VideoPlayer';
import { parseVideo } from '../utils/video';
import { colors, radius, spacing } from '../theme';

// Popup dell'esercizio: indicazioni del coach (serie, ripetizioni, carico, recupero, note),
// video tutorial e note personali dell'atleta.
// source: 'scheda' (esercizischeda.esercizioid) | 'workout' (calendar_workout_exercises.exercise_id)
export default function ExerciseSheet({ visible, exercise, source, isCoach, onClose, onSaved }) {
  const { width, height } = useWindowDimensions();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || !exercise) return;
    setNote(exercise.note_atleta || '');
    setSaved(false);
    setPlaying(false);
    setError(null);
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
});
