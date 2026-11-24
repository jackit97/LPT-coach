import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAthlete } from '../context/AthleteContext';
import { InlinePlayer } from '../components/VideoPlayer';
import { colors, spacing, radius, typography } from '../theme';
import ChatThread from '../components/ChatThread';

function ExecutionVideo({ url }) {
  const [playing, setPlaying] = useState(false);
  if (!url) return null;
  if (playing) return <InlinePlayer url={url} aspectRatio={4 / 5} />;
  return (
    <Pressable style={styles.poster} onPress={() => setPlaying(true)} accessibilityLabel="Guarda il video di esecuzione">
      <View style={styles.playCircle}><Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} /></View>
      <Text style={styles.posterText}>Guarda l'esecuzione</Text>
    </Pressable>
  );
}

// Coach: dettaglio del report inviato dall'atleta + chat con l'atleta
export default function ReportDetailScreen({ route, navigation }) {
  const { reportId } = route.params || {};
  const { clients, setSelectedAthlete } = useAthlete();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/reports/${reportId}`);
      setReport(data);
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile aprire il report');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openWorkout = () => {
    const athlete = clients.find((row) => row.utenteid === report.athlete_id);
    if (athlete) setSelectedAthlete(athlete);
    navigation.navigate('CalendarTab', { screen: 'WorkoutDetail', params: { workoutId: report.workout_id }, initial: false });
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  if (!report) return <View style={styles.center}><Text style={typography.caption}>Report non disponibile.</Text></View>;

  const feedback = report.feedback || {};
  const feedbackItems = [
    feedback.rpe ? ['RPE', String(feedback.rpe)] : null,
    feedback.sensazione ? ['Sensazione', feedback.sensazione] : null,
    feedback.durata_effettiva_minuti ? ['Durata', `${feedback.durata_effettiva_minuti} min`] : null,
  ].filter(Boolean);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl * 2 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.athlete}>{report.atleta}</Text>
      <Text style={styles.title}>{report.titolo}</Text>
      <Text style={typography.caption}>
        Allenamento del {String(report.data).slice(0, 10).split('-').reverse().join('/')} · inviato il {new Date(report.inviato_at).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </Text>
      <Pressable style={styles.linkBtn} onPress={openWorkout}>
        <Ionicons name="calendar-outline" size={16} color={colors.primary} />
        <Text style={styles.linkText}>Apri l'allenamento</Text>
      </Pressable>

      {(feedbackItems.length > 0 || feedback.note) && (
        <View style={styles.card}>
          <Text style={styles.section}>Feedback dell'atleta</Text>
          {feedbackItems.length > 0 && (
            <View style={styles.stats}>
              {feedbackItems.map(([label, value]) => (
                <View key={label} style={styles.stat}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}
          {!!feedback.note && <Text style={[styles.body, { marginTop: spacing.sm }]}>{feedback.note}</Text>}
        </View>
      )}

      {(report.esercizi || []).map((exercise) => {
        const prescribed = [exercise.serie && `${exercise.serie} serie`, exercise.ripetizioni && `${exercise.ripetizioni} rip`, exercise.carico, exercise.recupero && `rec ${exercise.recupero}`].filter(Boolean).join(' · ');
        const empty = !exercise.video_url && !exercise.dubbi && !exercise.note_atleta;
        return (
          <View key={exercise.exercise_id} style={[styles.card, empty && { opacity: 0.7 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="barbell" size={18} color={colors.primary} />
              <Text style={styles.exerciseName}>{exercise.nome}</Text>
            </View>
            {!!prescribed && <Text style={styles.prescribed}>{prescribed}</Text>}
            {!!exercise.video_url && <View style={{ marginTop: spacing.sm }}><ExecutionVideo url={exercise.video_url} /></View>}
            {!!exercise.dubbi && (
              <View style={styles.doubtBox}>
                <Text style={styles.doubtLabel}>Dubbi</Text>
                <Text style={styles.body}>{exercise.dubbi}</Text>
              </View>
            )}
            {!!exercise.note_atleta && (
              <View style={styles.noteBox}>
                <Text style={styles.noteLabel}>Note dell'atleta</Text>
                <Text style={styles.body}>{exercise.note_atleta}</Text>
              </View>
            )}
            {empty && <Text style={[typography.caption, { marginTop: spacing.xs }]}>Nessun video, dubbio o nota.</Text>}
          </View>
        );
      })}

      <View style={styles.card}>
        <Text style={styles.section}>Conversazione con l'atleta</Text>
        <Text style={typography.caption}>Correzioni sull'esecuzione, risposte ai dubbi, indicazioni per la prossima volta: l'atleta riceve una notifica e può risponderti qui.</Text>
        <ChatThread
          reloadKey={`report-${reportId}`}
          load={async () => {
            const { data } = await api.get(`/reports/${reportId}/messages`);
            return {
              messages: (data.messages || []).map((message) => ({
                key: message.message_id, mine: message.da_coach, author: message.da_coach ? 'Tu' : report.atleta || 'Atleta',
                testo: message.testo, created_at: message.created_at,
              })),
              otherReadAt: data.letto_atleta_at,
            };
          }}
          send={(testo) => api.post(`/reports/${reportId}/messages`, { testo })}
          placeholder="Scrivi all'atleta"
          emptyText="Nessun messaggio: scrivi il primo commento al report."
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  athlete: { fontSize: 13, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { ...typography.h1, marginTop: 2 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: spacing.sm },
  linkText: { color: colors.primary, fontWeight: '800' },
  card: { marginTop: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  section: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexGrow: 1, minWidth: 90, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.sm },
  statLabel: { fontSize: 10, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2 },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  exerciseName: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  prescribed: { ...typography.caption, marginTop: 2 },
  poster: { aspectRatio: 16 / 10, borderRadius: radius.md, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  playCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  posterText: { color: '#fff', fontWeight: '800', marginTop: spacing.sm },
  doubtBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FEF3C7' },
  doubtLabel: { fontSize: 11, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', marginBottom: 2 },
  noteBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  noteLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 2 },
  input: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceAlt, textAlignVertical: 'top', fontSize: 15, marginTop: spacing.sm },
  sendBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.sm },
  sendText: { color: '#fff', fontWeight: '800' },
});
