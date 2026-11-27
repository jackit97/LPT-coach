import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme';

// Analisi di un allenamento di forza: totali, volume per esercizio, progressi rispetto alle sedute precedenti.
// analysis = risposta del backend (analisi_forza in GET /calendar/:id)

const fmtNum = (value, digits = 1) => Number(value).toLocaleString('it-IT', { maximumFractionDigits: digits });
export const fmtVolume = (kg) => (!kg ? '—' : kg >= 10000 ? `${fmtNum(kg / 1000, 1)} t` : `${fmtNum(kg, 0)} kg`);
const fmtDay = (value) => { const iso = String(value || '').slice(0, 10); return iso ? iso.split('-').reverse().slice(0, 2).join('/') : ''; };
const signed = (value, unit) => `${value > 0 ? '+' : ''}${fmtNum(value)}${unit}`;

const SOURCE_TEXT = {
  eseguito: (a) => `Serie registrate dall'atleta (${a.esercizi_registrati}/${a.esercizi_totali} esercizi); per gli altri valori del programma.`,
  pianificato: () => 'Allenamento non ancora svolto: valori previsti dal programma del coach.',
  pianificato_completato: () => 'Serie non registrate: i valori arrivano dal programma. Tocca un esercizio e segna carichi e ripetizioni fatti per un\'analisi reale.',
  file: () => 'Serie registrate dall\'orologio (file importato).',
};

function Kpi({ label, value, hint }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {!!hint && <Text style={styles.kpiHint}>{hint}</Text>}
    </View>
  );
}

// barre verticali del carico massimo nelle ultime sedute + oggi
function Trend({ storico, current }) {
  const points = [...storico.map((item) => ({ value: item.top_kg || 0, label: fmtDay(item.data) })), { value: current || 0, label: 'oggi', today: true }];
  const max = Math.max(...points.map((p) => p.value), 1);
  if (points.length < 2) return null;
  return (
    <View style={styles.trend}>
      {points.map((point, index) => (
        <View key={index} style={styles.trendCol}>
          <Text style={styles.trendValue} numberOfLines={1}>{point.value ? fmtNum(point.value) : '—'}</Text>
          <View style={styles.trendTrack}>
            <View style={[styles.trendBar, { height: `${Math.max(4, (point.value / max) * 100)}%`, backgroundColor: point.today ? colors.primary : '#93C5FD' }]} />
          </View>
          <Text style={[styles.trendLabel, point.today && { color: colors.primary, fontWeight: '800' }]} numberOfLines={1}>{point.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function StrengthAnalysis({ analysis, onOpenExercise }) {
  if (!analysis || !analysis.esercizi?.length) return null;
  const maxVolume = Math.max(...analysis.esercizi.map((ex) => ex.volume_kg || 0), 1);
  const withVolume = analysis.esercizi.filter((ex) => ex.volume_kg > 0);
  // esercizi a tempo o a corpo libero senza carico: niente grafico dei carichi
  const progress = analysis.esercizi.filter((ex) => ex.top_kg || ex.storico?.some((item) => item.top_kg));
  const estimated = analysis.fonte !== 'eseguito' && analysis.fonte !== 'file';
  return (
    <View style={styles.card}>
      <Text style={typography.h3}>Analisi allenamento</Text>
      <View style={[styles.sourceBox, estimated && styles.sourceBoxWarn]}>
        <Ionicons name={estimated ? 'information-circle-outline' : 'checkmark-circle-outline'} size={16} color={estimated ? '#92400E' : colors.success} />
        <Text style={[styles.sourceText, estimated && { color: '#92400E' }]}>{(SOURCE_TEXT[analysis.fonte] || SOURCE_TEXT.pianificato)(analysis)}</Text>
      </View>

      <View style={styles.kpiGrid}>
        <Kpi label="Volume" value={fmtVolume(analysis.volume_kg)} hint="serie × rip × kg" />
        <Kpi label="Serie" value={analysis.serie || '—'} />
        <Kpi label="Ripetizioni" value={analysis.ripetizioni || '—'} />
        <Kpi label="Esercizi" value={analysis.esercizi_totali} />
      </View>

      {withVolume.length > 0 && (
        <>
          <Text style={styles.subTitle}>Volume per esercizio</Text>
          {withVolume.map((ex, index) => (
            <View key={`${ex.nome}-${index}`} style={styles.volRow}>
              <Text style={styles.volName} numberOfLines={1}>{ex.nome}</Text>
              <View style={styles.volTrack}><View style={[styles.volFill, { width: `${Math.max(3, (ex.volume_kg / maxVolume) * 100)}%` }]} /></View>
              <Text style={styles.volValue}>{fmtVolume(ex.volume_kg)}</Text>
            </View>
          ))}
        </>
      )}

      {progress.length > 0 && (
        <>
          <Text style={styles.subTitle}>Carichi e progressi</Text>
          {progress.map((ex, index) => {
            const Wrapper = onOpenExercise && ex.exercise_id ? Pressable : View;
            return (
              <Wrapper key={`${ex.nome}-p-${index}`} style={styles.progressCard} {...(Wrapper === Pressable ? { onPress: () => onOpenExercise(ex.exercise_id) } : {})}>
                <View style={styles.progressHead}>
                  <Text style={styles.progressName} numberOfLines={1}>{ex.nome}</Text>
                  {ex.record_e1rm && <Text style={styles.recordBadge}>🏆 record</Text>}
                  {!ex.registrato && analysis.fonte !== 'file' && <Text style={styles.plannedBadge}>da programma</Text>}
                </View>
                <View style={styles.progressStats}>
                  <Text style={styles.progressStat}>Max <Text style={styles.bold}>{ex.top_kg ? `${fmtNum(ex.top_kg)} kg` : '—'}</Text></Text>
                  {!!ex.e1rm && <Text style={styles.progressStat}>1RM stimato <Text style={styles.bold}>{fmtNum(ex.e1rm)} kg</Text></Text>}
                  <Text style={styles.progressStat}>{ex.serie} × {ex.serie ? Math.round(ex.ripetizioni / ex.serie) || '—' : '—'} rip</Text>
                </View>
                {ex.precedente ? (
                  <Text style={styles.deltaLine}>
                    Rispetto al {fmtDay(ex.precedente.data)}:{' '}
                    {ex.delta_top_kg !== null && <Text style={{ color: ex.delta_top_kg > 0 ? colors.success : ex.delta_top_kg < 0 ? colors.danger : colors.textMuted, fontWeight: '800' }}>{ex.delta_top_kg === 0 ? 'stesso carico' : signed(ex.delta_top_kg, ' kg')}</Text>}
                    {ex.delta_volume !== null && <Text style={styles.deltaMuted}>{'  '}volume {signed(ex.delta_volume, ' kg')}</Text>}
                  </Text>
                ) : <Text style={styles.deltaMuted}>Prima volta: nessuna seduta precedente da confrontare.</Text>}
                {ex.storico?.some((item) => item.top_kg) && <Trend storico={ex.storico} current={ex.top_kg} />}
              </Wrapper>
            );
          })}
        </>
      )}

      {analysis.fonte === 'file' && (
        <>
          <Text style={styles.subTitle}>Serie registrate</Text>
          <View style={styles.setHead}>
            <Text style={[styles.setCell, { flex: 0.4 }]}>#</Text>
            <Text style={[styles.setCell, { flex: 2, textAlign: 'left' }]}>Esercizio</Text>
            <Text style={styles.setCell}>Rip</Text>
            <Text style={styles.setCell}>Kg</Text>
            <Text style={styles.setCell}>Tempo</Text>
          </View>
          {analysis.esercizi.flatMap((ex) => ex.sets.map((set) => ({ ...set, nome: ex.nome }))).map((set, index) => (
            <View key={index} style={styles.setRow}>
              <Text style={[styles.setCell, { flex: 0.4, color: colors.textMuted }]}>{index + 1}</Text>
              <Text style={[styles.setCell, { flex: 2, textAlign: 'left', fontWeight: '700' }]} numberOfLines={1}>{set.nome}</Text>
              <Text style={styles.setCell}>{set.reps ?? '—'}</Text>
              <Text style={styles.setCell}>{typeof set.kg === 'number' ? fmtNum(set.kg) : (set.kg || '—')}</Text>
              <Text style={styles.setCell}>{set.secondi ? `${Math.floor(set.secondi / 60)}:${String(set.secondi % 60).padStart(2, '0')}` : '—'}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  sourceBox: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: '#DCFCE7', borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  sourceBoxWarn: { backgroundColor: '#FEF3C7' },
  sourceText: { flex: 1, fontSize: 12, color: '#166534', lineHeight: 17 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  kpi: { flexGrow: 1, flexBasis: '40%', minWidth: 120, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.sm },
  kpiLabel: { fontSize: 10, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  kpiHint: { fontSize: 10, color: colors.textMuted },
  subTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  volName: { width: 110, fontSize: 13, fontWeight: '700', color: colors.text },
  volTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  volFill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  volValue: { width: 64, textAlign: 'right', fontSize: 12, fontWeight: '800', color: colors.text },
  progressCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressName: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  recordBadge: { fontSize: 11, fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  plannedBadge: { fontSize: 10, fontWeight: '700', color: colors.textMuted, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  progressStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 4 },
  progressStat: { fontSize: 13, color: colors.textMuted },
  bold: { fontWeight: '800', color: colors.text },
  deltaLine: { fontSize: 12, color: colors.text, marginTop: 6 },
  deltaMuted: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  trend: { flexDirection: 'row', gap: 6, marginTop: spacing.sm, height: 92 },
  trendCol: { flex: 1, alignItems: 'center' },
  trendValue: { fontSize: 10, fontWeight: '700', color: colors.text },
  trendTrack: { flex: 1, width: '70%', maxWidth: 28, justifyContent: 'flex-end', marginVertical: 2 },
  trendBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  trendLabel: { fontSize: 10, color: colors.textMuted },
  setHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 4 },
  setRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  setCell: { flex: 1, fontSize: 12, textAlign: 'center', color: colors.text },
});
