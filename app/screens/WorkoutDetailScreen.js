import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography, workoutTypeColors, statusColors } from '../theme';
import RpeSelector from '../components/RpeSelector';
import ExerciseSheet from '../components/ExerciseSheet';
import { Ionicons } from '@expo/vector-icons';
import { ZONE_COLORS, sportInfo, formatHMS, formatKm, performanceStatus } from '../utils/endurance';
import LoadChart from '../components/LoadChart';
import ActivityCharts, { ZoneBars, LapsTable, fmtClock } from '../components/ActivityCharts';

const SENSAZIONI = ['ottimo', 'buono', 'normale', 'difficile', 'pessimo'];
const TRIMP_METHODS = { fc: 'dalla frequenza cardiaca media', fc_campioni: 'dal tempo reale in ogni zona FC', rpe: 'da RPE percepito', pianificato: 'dal pianificato sulla durata reale', stima: 'stimato' };

// Dettaglio carico (CoachPeaking): confronto tra allenamento assegnato ed eseguito.
function LoadDetail({ load }) {
  if (!load) return null;
  const rows = [
    { label: 'Tempo', planned: load.secondi_pianificati ? formatHMS(load.secondi_pianificati) : '—', done: load.secondi_eseguiti ? formatHMS(load.secondi_eseguiti) : '—', pct: load.secondi_pianificati ? load.secondi_eseguiti / load.secondi_pianificati : null },
    { label: 'Distanza', planned: load.metri_pianificati ? formatKm(load.metri_pianificati, 2) : '—', done: load.metri_eseguiti ? formatKm(load.metri_eseguiti, 2) : '—', pct: load.metri_pianificati ? load.metri_eseguiti / load.metri_pianificati : null },
    { label: 'TRIMP', planned: load.trimp_pianificato || '—', done: load.trimp_eseguito || '—', pct: load.trimp_pianificato ? load.trimp_eseguito / load.trimp_pianificato : null },
  ];
  return (
    <View style={styles.loadCard}>
      <Text style={typography.h3}>Dettaglio carico</Text>
      <View style={styles.loadHeaderRow}>
        <Text style={[styles.loadCell, styles.loadHead, { flex: 1.2 }]} />
        <Text style={[styles.loadCell, styles.loadHead]}>Assegnato</Text>
        <Text style={[styles.loadCell, styles.loadHead]}>Eseguito</Text>
        <Text style={[styles.loadCell, styles.loadHead]}>%</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.loadRow}>
          <Text style={[styles.loadCell, { flex: 1.2, fontWeight: '700' }]}>{row.label}</Text>
          <Text style={styles.loadCell}>{row.planned}</Text>
          <Text style={[styles.loadCell, { fontWeight: '800' }]}>{row.done}</Text>
          <Text style={[styles.loadCell, { color: row.pct === null ? colors.textMuted : row.pct < 0.7 ? colors.warning : colors.success, fontWeight: '800' }]}>
            {row.pct === null || !row.done || row.done === '—' ? '—' : `${Math.round(row.pct * 100)}%`}
          </Text>
        </View>
      ))}
      {!!load.trimp_metodo && <Text style={styles.loadNote}>TRIMP eseguito {TRIMP_METHODS[load.trimp_metodo] || ''}</Text>}
    </View>
  );
}

const isoAdd = (iso, days) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Impatto della seduta su carico acuto, cronico e performance (stesso grafico della home, centrato sul giorno)
function LoadImpact({ workout }) {
  const [data, setData] = useState(null);
  const day = String(workout.data).slice(0, 10);
  useFocusEffect(useCallback(() => {
    let active = true;
    api.get('/endurance/load', { params: { utenteId: workout.utenteid, from: isoAdd(day, -55), to: isoAdd(day, 14) } })
      .then(({ data: result }) => { if (active) setData(result); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [workout.utenteid, day]));
  if (!data?.series?.length) return null;
  const point = data.series.find((p) => p.data === day);
  const before = data.series.find((p) => p.data === isoAdd(day, -1));
  if (!point) return null;
  const trimp = workout.load?.trimp_eseguito || workout.load?.trimp_pianificato || 0;
  const delta = (key) => (before ? point[key] - before[key] : 0);
  const fmtDelta = (value) => `${value >= 0 ? '+' : ''}${Math.round(value)}`;
  const status = performanceStatus(point.performance);
  const cards = [
    { label: workout.load?.trimp_eseguito ? 'TRIMP seduta' : 'TRIMP previsto', value: trimp, color: colors.text, hint: workout.load?.trimp_eseguito ? 'carico di questo allenamento' : 'non ancora svolto' },
    { label: 'Carico acuto', value: Math.round(point.acuto), color: '#2563eb', hint: `${fmtDelta(delta('acuto'))} rispetto al giorno prima` },
    { label: 'Carico cronico', value: Math.round(point.cronico), color: '#c026d3', hint: `${fmtDelta(delta('cronico'))} rispetto al giorno prima` },
    { label: 'Performance', value: `${point.performance > 0 ? '+' : ''}${Math.round(point.performance)}`, color: status.color, hint: status.label },
  ];
  return (
    <View style={styles.chartSection}>
      <Text style={typography.h3}>Impatto sul carico</Text>
      <Text style={styles.loadNote}>Valori a fine giornata del {day.split('-').reverse().slice(0, 2).join('/')}{point.proiezione ? ' (proiezione sul pianificato)' : ''}</Text>
      <View style={styles.impactGrid}>
        {cards.map((card) => (
          <View key={card.label} style={styles.impactCard}>
            <Text style={styles.impactLabel}>{card.label}</Text>
            <Text style={[styles.impactValue, { color: card.color }]}>{card.value}</Text>
            <Text style={styles.impactHint}>{card.hint}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <LoadChart series={data.series} height={150} markerDate={day} markerLabel="allenamento" />
      </View>
    </View>
  );
}

function formatDuration(workout) {
  const seconds = Number(workout.durata_secondi ?? (Number(workout.durata_minuti) || 0) * 60);
  if (!seconds) return 'durata libera';
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

function durationFromSteps(steps) {
  const parse = (value) => { const parts = String(value || '').split(':').map(Number); if (!parts.every(Number.isFinite)) return 0; if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; return parts.length === 2 ? parts[0] * 60 + parts[1] : 0; };
  return steps.reduce((total, step) => total + parse(step.duration), 0);
}

export default function WorkoutDetailScreen({ route, navigation }) {
  const { workoutId } = route.params;
  const { user, isCoach } = useAuth();
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);

  const [rpe, setRpe] = useState('');
  const [sensazione, setSensazione] = useState('');
  const [durataEffettiva, setDurataEffettiva] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/calendar/${workoutId}`);
      setWorkout(data);
      if (data.feedback) {
        setRpe(data.feedback.rpe ? String(data.feedback.rpe) : '');
        setSensazione(data.feedback.sensazione ?? '');
        setDurataEffettiva(String(data.feedback.durata_effettiva_minuti ?? ''));
        setNote(data.feedback.note ?? '');
      }
    } catch (e) {
      Alert.alert('Errore', 'Impossibile caricare il workout');
    } finally {
      setLoading(false);
    }
  }, [workoutId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitFeedback = async (completato) => {
    setSaving(true);
    try {
      await api.post(`/calendar/${workoutId}/feedback`, {
        completato,
        rpe: rpe ? Number(rpe) : null,
        sensazione: sensazione || null,
        durataEffettivaMinuti: durataEffettiva ? Number(durataEffettiva) : null,
        note: note || null,
      });
      await load();
      const strength = workout?.tipo !== 'endurance' && (workout?.esercizi?.length || 0) > 0;
      if (completato && strength) askSendReport();
      else Alert.alert('Fatto', 'Feedback salvato');
    } catch (e) {
      Alert.alert('Errore', 'Impossibile salvare il feedback');
    } finally {
      setSaving(false);
    }
  };

  // Report per il coach: feedback, note, dubbi e video di esecuzione di ogni esercizio
  const [sendingReport, setSendingReport] = useState(false);
  const sendReport = async () => {
    setSendingReport(true);
    try {
      await api.post('/reports', { workoutId });
      await load();
      Alert.alert('Report inviato', 'Il coach riceverà una notifica con video, note e dubbi.');
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile inviare il report');
    } finally {
      setSendingReport(false);
    }
  };
  const askSendReport = () => {
    const videos = (workout?.esercizi || []).filter((ex) => ex.esecuzione_video_url).length;
    const doubts = (workout?.esercizi || []).filter((ex) => String(ex.esecuzione_dubbi || '').trim()).length;
    const summary = [videos ? `${videos} video` : null, doubts ? `${doubts} ${doubts === 1 ? 'dubbio' : 'dubbi'}` : null].filter(Boolean).join(' e ');
    Alert.alert(
      'Allenamento completato',
      `Vuoi inviare il report al coach${summary ? ` (${summary}, note e feedback)` : ' con il tuo feedback e le note'}?`,
      [
        { text: 'Non inviare', style: 'cancel' },
        { text: 'Invia report', onPress: sendReport },
      ],
    );
  };

  const [openExercise, setOpenExercise] = useState(null);
  const onExerciseNoteSaved = (id, note) => {
    setWorkout((current) => ({ ...current, esercizi: current.esercizi.map((ex) => (ex.exercise_id === id ? { ...ex, note_atleta: note } : ex)) }));
  };
  const onExecutionChange = (id, changes) => {
    setWorkout((current) => ({ ...current, esercizi: current.esercizi.map((ex) => (ex.exercise_id === id ? { ...ex, ...changes } : ex)) }));
    setOpenExercise((current) => (current && current.exercise_id === id ? { ...current, ...changes } : current));
  };
  const [librarySaved, setLibrarySaved] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const saveToLibrary = async () => {
    setSavingLibrary(true);
    try {
      await api.post(`/workouts/templates/from-workout/${workoutId}`, {});
      setLibrarySaved(true);
      Alert.alert('Libreria', 'Allenamento salvato in libreria');
    } catch (error) {
      Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare in libreria');
    } finally {
      setSavingLibrary(false);
    }
  };

  const deleteWorkout = () => {
    const imported = workout?.external_provider === 'file';
    Alert.alert(imported ? 'Elimina attività' : 'Elimina workout', imported ? 'Eliminare questa attività importata? Potrai ricaricare il file con ⤓ Importa.' : 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          try { await api.delete(`/calendar/${workoutId}`); navigation.goBack(); }
          catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile eliminare il workout'); }
        },
      },
    ]);
  };

  if (loading || !workout) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  const sport = sportInfo(workout.sport);
  const typeColor = sport?.color || workoutTypeColors[workout.tipo] || colors.primary;

  let structuredSteps = [];
  if (workout.endurance?.steps_json) {
    try { structuredSteps = JSON.parse(workout.endurance.steps_json); } catch { structuredSteps = []; }
  }
  const calculatedStepSeconds = durationFromSteps(structuredSteps);

  const exportFit = async () => {
    if (typeof window === 'undefined' || !window.document) return Alert.alert('Export FIT', 'Il download FIT è disponibile dalla versione web.');
    try {
      const response = await api.get(`/endurance/workouts/${workout.workout_id}/fit`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${String(workout.titolo || 'lpt-workout').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'lpt-workout'}.fit`;
      window.document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile esportare il workout FIT'); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={[styles.typeTag, { backgroundColor: typeColor + '1A', borderColor: typeColor }]}>
        <Text style={[styles.typeTagText, { color: typeColor }]}>{sport ? `${sport.icon} ${sport.label.toUpperCase()}` : workout.tipo?.toUpperCase()}</Text>
      </View>

      <Text style={styles.title}>{workout.titolo}</Text>
      <Text style={styles.date}>{String(workout.data).slice(0, 10)} · {calculatedStepSeconds > 0 ? formatDuration({ durata_secondi: calculatedStepSeconds }) : workout.load?.secondi_pianificati ? formatDuration({ durata_secondi: workout.load.secondi_pianificati }) : formatDuration(workout)}</Text>

      <View style={[styles.statusPill, { backgroundColor: (statusColors[workout.stato] || colors.textMuted) + '1A' }]}>
        <Text style={{ color: statusColors[workout.stato] || colors.textMuted, fontWeight: '700', fontSize: 12 }}>
          {workout.stato}
        </Text>
      </View>

      {(workout.external_provider === 'strava' || workout.external_provider === 'file') && (
        <View style={[styles.stravaBanner, workout.external_provider === 'file' && styles.fileBanner]}>
          <View style={styles.stravaBannerHeader}>
            <Text style={{ fontSize: 18 }}>{workout.external_provider === 'strava' ? '⚡' : '⌚'}</Text>
            <View>
              <Text style={[styles.stravaBannerTitle, workout.external_provider === 'file' && { color: colors.primary }]}>
                {workout.external_provider === 'strava' ? 'Attività Strava sincronizzata' : 'Attività importata da file'}
              </Text>
              {workout.external_provider === 'strava' && <Text style={styles.stravaBannerSubtitle}>ID attività: {workout.external_id}</Text>}
            </View>
          </View>
          <View style={styles.stravaMetricGrid}>
            {!!workout.distance_km && (
              <View style={styles.stravaMetricCard}>
                <Text style={styles.stravaMetricLabel}>Distanza</Text>
                <Text style={styles.stravaMetricValue}>{Number(workout.distance_km).toFixed(2)} km</Text>
              </View>
            )}
            {!!(workout.durata_secondi || workout.durata_minuti) && (
              <View style={styles.stravaMetricCard}>
                <Text style={styles.stravaMetricLabel}>Tempo</Text>
                <Text style={styles.stravaMetricValue}>{formatDuration(workout)}</Text>
              </View>
            )}
            {!!workout.avg_hr && (
              <View style={styles.stravaMetricCard}>
                <Text style={styles.stravaMetricLabel}>FC Media</Text>
                <Text style={styles.stravaMetricValue}>{workout.avg_hr} bpm</Text>
              </View>
            )}
            {!!workout.elev_gain_m && (
              <View style={styles.stravaMetricCard}>
                <Text style={styles.stravaMetricLabel}>Dislivello</Text>
                <Text style={styles.stravaMetricValue}>+{workout.elev_gain_m} m</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {workout.load?.zone_profile?.length > 0 && (
        <View style={styles.chartSection}>
          <Text style={typography.h3}>Profilo allenamento</Text>
          <View style={styles.timeline}>
            {workout.load.zone_profile.map((segment, index) => {
              const level = Number(String(segment.zone).replace(/\D/g, '')) || 0;
              return (
                <View key={index} style={{ flex: Math.max(1, segment.seconds), justifyContent: 'flex-end' }}>
                  <View style={{ height: 8 + level * 11, backgroundColor: ZONE_COLORS[segment.zone] || colors.primary, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
                </View>
              );
            })}
          </View>
          <View style={styles.zoneLegend}>
            {Object.entries(workout.load.zone_seconds || {}).filter(([, sec]) => sec > 0).sort().map(([zone, sec]) => (
              <View key={zone} style={styles.zoneLegendItem}>
                <View style={[styles.zoneLegendDot, { backgroundColor: ZONE_COLORS[zone] || colors.primary }]} />
                <Text style={styles.zoneLegendText}>{zone} {formatHMS(sec)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {workout.tipo === 'endurance' && <LoadDetail load={workout.load} />}

      {workout.tipo === 'endurance' && <LoadImpact workout={workout} />}

      {workout.tipo === 'endurance' && workout.streams && (
        <View style={styles.chartSection}>
          <Text style={typography.h3}>Analisi attività</Text>
          <View style={{ marginTop: spacing.sm }}>
            <ActivityCharts streams={workout.streams} sport={workout.sport} />
          </View>
          {Object.keys(workout.streams.secondi_zona_fc || {}).length > 0 && (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={styles.subTitle}>Tempo in zona FC</Text>
              <ZoneBars zoneSeconds={workout.streams.secondi_zona_fc} zones={workout.streams.zone_fc} />
            </View>
          )}
          {!Object.keys(workout.streams.secondi_zona_fc || {}).length && Array.isArray(workout.streams.hr) && (
            <Text style={[styles.loadNote, { marginTop: spacing.sm }]}>Imposta le zone FC dell'atleta (Zone e test) per vedere il tempo in ogni zona.</Text>
          )}
          {workout.streams.laps?.length > 1 && (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={styles.subTitle}>Intertempi ({workout.streams.laps.length} giri)</Text>
              <LapsTable laps={workout.streams.laps} sport={workout.sport} />
            </View>
          )}
        </View>
      )}

      {!!workout.descrizione && (
        <View style={styles.section}>
          <Text style={typography.h3}>Descrizione</Text>
          <Text style={styles.paragraph}>{workout.descrizione}</Text>
        </View>
      )}

      {workout.scheda && (
        <View style={styles.section}>
          <Text style={typography.h3}>Scheda palestra</Text>
          <Text style={styles.detailLine}>
            Periodo: {String(workout.scheda.datainizio).slice(0, 10)} → {workout.scheda.datafine ? String(workout.scheda.datafine).slice(0, 10) : '—'}
          </Text>
          {!!workout.scheda.notegenerali && <Text style={styles.paragraph}>{workout.scheda.notegenerali}</Text>}
        </View>
      )}

      {workout.endurance && (
        <View style={styles.section}>
          <Text style={typography.h3}>Dettagli sessione</Text>
          <Pressable style={styles.fitButton} onPress={exportFit}><Text style={styles.fitButtonText}>Esporta workout Garmin (.FIT)</Text></Pressable>
          {!!workout.endurance.zone && <Text style={styles.detailLine}>Zona: {workout.endurance.zone}</Text>}
          {!!workout.endurance.target && <Text style={styles.detailLine}>Obiettivo: {workout.endurance.target}</Text>}
          {!!workout.endurance.rpe_target && <Text style={styles.detailLine}>RPE obiettivo: {workout.endurance.rpe_target}</Text>}
          {!!workout.endurance.elevation_m && <Text style={styles.detailLine}>Dislivello: +{workout.endurance.elevation_m} m</Text>}
          {!!workout.endurance.description && <Text style={styles.paragraph}>{workout.endurance.description}</Text>}
          {!!workout.endurance.steps_text && <Text style={styles.paragraph}>{workout.endurance.steps_text}</Text>}
          {structuredSteps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <Text style={styles.stepTitle}>{step.type || `Fase ${index + 1}`} · {step.repeats || 1} x {step.meters ? `${step.meters} m` : (step.duration || 'durata libera')} {step.zone ? `· ${step.zone}` : ''}</Text>
              {!!step.notes && <Text style={styles.exerciseNote}>{step.notes}</Text>}
              {(step.children || []).map((child, childIndex) => <View key={childIndex} style={{ marginTop: spacing.xs, marginLeft: spacing.md, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.primary }}><Text style={styles.stepTitle}>{child.type || 'Sottofase'} · {child.repeats || 1} x {child.value || child.meters || child.duration || 'durata libera'} {child.unit || ''} {child.zone ? `· ${child.zone}` : ''}</Text>{!!child.notes && <Text style={styles.exerciseNote}>{child.notes}</Text>}</View>)}
            </View>
          ))}
        </View>
      )}

      {workout.esercizi?.length > 0 && (
        <View style={styles.section}>
          <Text style={typography.h3}>Esercizi</Text>
          {workout.esercizi.map((ex) => (
            <Pressable key={ex.exercise_id} style={({ pressed }) => [styles.exerciseRow, pressed && { opacity: 0.8 }]} onPress={() => setOpenExercise(ex)}>
              <View style={styles.exerciseHeader}>
                <Text style={[styles.exerciseName, { flex: 1 }]}>{ex.nome}</Text>
                {/* video solo per gli allenamenti di pesistica/forza */}
                {!!ex.video_url && workout.tipo !== 'endurance' && (
                  <View style={styles.playBadge}><Ionicons name="play" size={15} color="#fff" style={{ marginLeft: 2 }} /></View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={styles.exerciseMeta}>
                {[ex.serie && `${ex.serie} serie`, ex.ripetizioni && `${ex.ripetizioni} rip`, ex.carico, ex.recupero && `rec ${ex.recupero}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {!!ex.note && <Text style={styles.exerciseNote} numberOfLines={2}>{ex.note}</Text>}
              {!!ex.note_atleta && <Text style={styles.athleteNote} numberOfLines={1}>📝 {isCoach ? 'Nota atleta' : 'La mia nota'}: {ex.note_atleta}</Text>}
              {(!!ex.esecuzione_video_url || !!ex.esecuzione_dubbi) && (
                <View style={styles.execChips}>
                  {!!ex.esecuzione_video_url && <Text style={styles.execChip}>🎥 Video esecuzione</Text>}
                  {!!ex.esecuzione_dubbi && <Text style={[styles.execChip, styles.execChipDoubt]} numberOfLines={1}>❓ {ex.esecuzione_dubbi}</Text>}
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      <ExerciseSheet
        visible={!!openExercise}
        exercise={openExercise ? { ...openExercise, video_url: workout.tipo !== 'endurance' ? openExercise.video_url : null } : null}
        source="workout"
        isCoach={isCoach}
        onClose={() => setOpenExercise(null)}
        onSaved={onExerciseNoteSaved}
        allowExecution={workout.tipo !== 'endurance'}
        onExecutionChange={onExecutionChange}
      />

      {workout.tipo !== 'endurance' && workout.esercizi?.length > 0 && (workout.report || (!isCoach && workout.stato === 'completato')) && (
        <View style={styles.reportCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            <Text style={[typography.h3, { flex: 1 }]}>Report per il coach</Text>
          </View>
          {workout.report ? (
            <Text style={styles.reportMeta}>
              Inviato il {new Date(workout.report.inviato_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
              {' · '}{workout.report.letto_at ? 'letto dal coach' : 'non ancora letto'}
            </Text>
          ) : (
            <Text style={styles.reportMeta}>Non ancora inviato. Allega video di esecuzione e dubbi dai singoli esercizi.</Text>
          )}
          {!!workout.report?.risposta && (
            <View style={styles.reportReply}>
              <Text style={styles.reportReplyLabel}>Risposta del coach</Text>
              <Text style={styles.paragraph}>{workout.report.risposta}</Text>
            </View>
          )}
          {isCoach && workout.report && (
            <Pressable style={[styles.reportButton, styles.reportButtonSecondary, { marginTop: spacing.sm }]} onPress={() => navigation.navigate('ReportsTab', { screen: 'ReportDetail', params: { reportId: workout.report.report_id }, initial: false })}>
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Apri il report</Text>
            </Pressable>
          )}
          {!isCoach && workout.stato === 'completato' && (
            <Pressable style={[styles.reportButton, { marginTop: spacing.sm }]} onPress={sendReport} disabled={sendingReport}>
              {sendingReport ? <ActivityIndicator color={colors.textInverse} /> : (
                <Text style={styles.primaryButtonText}>{workout.report ? 'Reinvia report aggiornato' : 'Invia report al coach'}</Text>
              )}
            </Pressable>
          )}
        </View>
      )}

      {isCoach ? (
        <View style={styles.coachActions}>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate(workout.tipo === 'endurance' ? 'EnduranceWorkoutEditor' : 'WorkoutEditor', { workoutId: workout.workout_id })}>
            <Text style={styles.secondaryButtonText}>Modifica</Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, librarySaved && styles.savedButton]} onPress={saveToLibrary} disabled={savingLibrary}>
            <Text style={[styles.secondaryButtonText, librarySaved && { color: colors.success }]}>
              {savingLibrary ? 'Salvataggio…' : librarySaved ? '✓ In libreria' : 'Salva in libreria'}
            </Text>
          </Pressable>
          <Pressable style={styles.dangerButton} onPress={deleteWorkout}>
            <Text style={styles.dangerButtonText}>Elimina</Text>
          </Pressable>
        </View>
      ) : (
        <>
        {workout.external_provider === 'file' && (
          <Pressable style={[styles.dangerButton, styles.deleteImported]} onPress={deleteWorkout}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.dangerButtonText}>Elimina attività importata</Text>
          </Pressable>
        )}
        <View style={styles.section}>
          <Text style={typography.h3}>Il tuo feedback</Text>

          <Text style={styles.fieldLabel}>Come ti sei sentito?</Text>
          <View style={styles.chipsRow}>
            {SENSAZIONI.map((s) => (
              <Pressable key={s} onPress={() => setSensazione(s)} style={[styles.chip, sensazione === s && styles.chipActive]}>
                <Text style={[styles.chipText, sensazione === s && styles.chipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Fatica percepita (RPE 1-10)</Text>
          <RpeSelector value={rpe} onChange={setRpe} />

          <Text style={styles.fieldLabel}>Durata effettiva (minuti)</Text>
          <TextInput value={durataEffettiva} onChangeText={setDurataEffettiva} keyboardType="numeric" style={styles.input} placeholder="Minuti" />

          <Text style={styles.fieldLabel}>Note</Text>
          <TextInput value={note} onChangeText={setNote} style={[styles.input, styles.textArea]} multiline placeholder="Note" />

          <View style={styles.feedbackActions}>
            <Pressable style={styles.secondaryButton} onPress={() => submitFeedback(false)} disabled={saving}>
              <Text style={styles.secondaryButtonText}>Segna come saltato</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => submitFeedback(true)} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Segna completato</Text>}
            </Pressable>
          </View>
        </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  typeTag: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  typeTagText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  title: { ...typography.h1, marginTop: spacing.sm },
  date: { ...typography.caption, marginTop: spacing.xs },
  statusPill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginTop: spacing.sm },
  chartSection: { marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  timeline: { height: 96, flexDirection: 'row', alignItems: 'stretch', gap: 1, borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm },
  zoneLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  zoneLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneLegendDot: { width: 10, height: 10, borderRadius: 2 },
  zoneLegendText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  impactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  impactCard: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm },
  impactLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  impactValue: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  impactHint: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  subTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  deleteImported: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, flex: 0, paddingVertical: spacing.md },
  fileBanner: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  execChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  execChip: { fontSize: 11, fontWeight: '700', color: colors.primary, backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', maxWidth: '100%' },
  execChipDoubt: { color: '#92400E', backgroundColor: '#FEF3C7' },
  reportCard: { marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  reportMeta: { ...typography.caption },
  reportButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  reportButtonSecondary: { backgroundColor: colors.surfaceAlt },
  reportReply: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  reportReplyLabel: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', marginBottom: 2 },
  loadCard: { marginTop: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  loadHeaderRow: { flexDirection: 'row', marginTop: spacing.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  loadRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  loadCell: { flex: 1, fontSize: 13, color: colors.text },
  loadHead: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  loadNote: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
  section: { marginTop: spacing.xl },
  fitButton: { alignSelf: 'flex-start', marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  fitButtonText: { color: colors.textInverse, fontWeight: '700', fontSize: 12 },
  paragraph: { ...typography.body, marginTop: spacing.sm, lineHeight: 20 },
  detailLine: { ...typography.caption, marginTop: spacing.xs },
  stepRow: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.xs },
  stepTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
  exerciseRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  savedButton: { backgroundColor: '#ECFDF5' },
  playBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  athleteNote: { fontSize: 12, color: colors.accent, fontWeight: '600', marginTop: 4 },
  exerciseName: { fontWeight: '700', fontSize: 14, color: colors.text },
  exerciseMeta: { ...typography.caption, marginTop: 2 },
  exerciseNote: { ...typography.caption, marginTop: 4, fontStyle: 'italic' },
  coachActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  feedbackActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  primaryButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
  dangerButton: { flex: 1, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerButtonText: { color: colors.danger, fontWeight: '700' },
  stravaBanner: { marginTop: spacing.md, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FFEDD5', borderRadius: radius.md, padding: spacing.md },
  stravaBannerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  stravaBannerTitle: { fontSize: 13, fontWeight: '800', color: '#9A3412' },
  stravaBannerSubtitle: { fontSize: 11, color: '#C2410C' },
  stravaMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stravaMetricCard: { flex: 1, minWidth: 90, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FED7AA', borderRadius: radius.sm, padding: spacing.sm },
  stravaMetricLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  stravaMetricValue: { fontSize: 14, fontWeight: '800', color: '#EA580C', marginTop: 2 },
});
