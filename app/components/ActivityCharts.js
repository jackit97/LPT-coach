import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { ZONE_COLORS } from '../utils/endurance';

// Analisi di un'attivita' svolta in stile CoachPeaking: grafici di FC, passo/velocita', quota, potenza
// e cadenza sullo stesso asse dei tempi, con cursore (tocca/trascina) che mostra i valori in quel punto,
// tempo trascorso in ogni zona FC e intertempi. Disegnato con sole View: funziona su web, Android e iOS.

const pad = (value) => String(value).padStart(2, '0');
export function fmtClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
// velocita' (m/s) -> passo "m:ss" sui metri indicati
function fmtPace(speed, base) {
  if (!speed || speed <= 0.3) return '—';
  const sec = Math.round(base / speed);
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}

function metricsFor(sport) {
  const pace = sport === 'corsa' ? { base: 1000, unit: '/km' } : sport === 'nuoto' ? { base: 100, unit: '/100m' } : null;
  return [
    { key: 'hr', label: 'Frequenza cardiaca', short: 'FC', color: '#dc2626', unit: 'bpm', format: (v) => `${Math.round(v)}` },
    pace
      ? { key: 'spd', label: 'Passo', short: 'Passo', color: '#2563eb', unit: pace.unit, format: (v) => fmtPace(v, pace.base), invertHint: true }
      : { key: 'spd', label: 'Velocità', short: 'Vel.', color: '#2563eb', unit: 'km/h', format: (v) => (v * 3.6).toFixed(1) },
    { key: 'alt', label: 'Altitudine', short: 'Quota', color: '#64748b', unit: 'm', format: (v) => `${Math.round(v)}`, area: true },
    { key: 'pwr', label: 'Potenza', short: 'Pot.', color: '#7c3aed', unit: 'W', format: (v) => `${Math.round(v)}` },
    { key: 'cad', label: 'Cadenza', short: 'Cad.', color: '#0d9488', unit: sport === 'ciclismo' ? 'rpm' : 'ppm', format: (v) => `${Math.round(v)}` },
  ];
}

function Segment({ x1, y1, x2, y2, color }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!length) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - 1, width: length, height: 2,
        backgroundColor: color, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
      }}
    />
  );
}

// Valore robusto per scala: ignora gli outlier (es. passo da fermo) usando i percentili
function range(values, { from = 0.02, to = 0.98 } = {}) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const lo = list[Math.floor((list.length - 1) * from)];
  const hi = list[Math.ceil((list.length - 1) * to)];
  return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
}

function MetricChart({ metric, t, values, width, height, cursor, totalSeconds }) {
  const geometry = useMemo(() => {
    const bounds = range(values, metric.key === 'spd' ? { from: 0.05, to: 0.99 } : undefined);
    if (!bounds || !width) return null;
    const [lo, hi] = bounds;
    const span = hi - lo;
    const min = lo - span * 0.08;
    const max = hi + span * 0.08;
    const x = (sec) => (sec / totalSeconds) * width;
    const y = (v) => 4 + (height - 8) * (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min));
    return { min, max, x, y };
  }, [values, width, height, totalSeconds, metric.key]);
  if (!geometry) return null;
  const valid = values.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
  const avg = valid.reduce((sum, i) => sum + values[i], 0) / (valid.length || 1);
  return (
    <View style={{ height }}>
      {metric.area ? valid.map((i, n) => {
        const next = valid[n + 1] ?? i;
        const left = geometry.x(t[i]);
        const w = Math.max(1, geometry.x(t[next]) - left + 0.5);
        const top = geometry.y(values[i]);
        return <View key={i} pointerEvents="none" style={{ position: 'absolute', left, width: w, top, bottom: 0, backgroundColor: `${metric.color}38` }} />;
      }) : null}
      {valid.slice(1).map((i, n) => {
        const prev = valid[n];
        if (t[i] - t[prev] > Math.max(60, totalSeconds / 40)) return null; // pausa: niente linea
        return <Segment key={i} x1={geometry.x(t[prev])} y1={geometry.y(values[prev])} x2={geometry.x(t[i])} y2={geometry.y(values[i])} color={metric.color} />;
      })}
      {/* media */}
      <View pointerEvents="none" style={[styles.avgLine, { top: geometry.y(avg), borderColor: metric.color }]} />
      <Text style={[styles.axisLabel, { top: 0 }]}>{metric.format(geometry.max)}</Text>
      <Text style={[styles.axisLabel, { bottom: 0 }]}>{metric.format(geometry.min)}</Text>
      {cursor !== null && Number.isFinite(values[cursor]) && (
        <View pointerEvents="none" style={[styles.dot, { left: geometry.x(t[cursor]) - 4, top: geometry.y(values[cursor]) - 4, backgroundColor: metric.color }]} />
      )}
    </View>
  );
}

export function ZoneBars({ zoneSeconds = {}, zones = [] }) {
  const total = Object.values(zoneSeconds).reduce((sum, v) => sum + (Number(v) || 0), 0);
  if (!total) return null;
  const keys = (zones.length ? zones.map((z) => z.key) : Object.keys(zoneSeconds)).filter(Boolean);
  const max = Math.max(...keys.map((k) => zoneSeconds[k] || 0));
  return (
    <View style={{ gap: 6 }}>
      {keys.map((key) => {
        const sec = zoneSeconds[key] || 0;
        const zone = zones.find((z) => z.key === key);
        return (
          <View key={key} style={styles.zoneRow}>
            <Text style={styles.zoneKey}>{key}</Text>
            <Text style={styles.zoneRange}>{zone ? `${zone.min}-${zone.max}` : ''}</Text>
            <View style={styles.zoneTrack}>
              <View style={[styles.zoneFill, { width: `${max ? (sec / max) * 100 : 0}%`, backgroundColor: ZONE_COLORS[key] || colors.primary }]} />
            </View>
            <Text style={styles.zoneValue}>{fmtClock(sec)}</Text>
            <Text style={styles.zonePct}>{Math.round((sec / total) * 100)}%</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function ActivityCharts({ streams, sport }) {
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [hidden, setHidden] = useState({});
  const t = streams?.t || [];
  const totalSeconds = t.length ? t[t.length - 1] || 1 : 1;
  const metrics = metricsFor(sport).filter((metric) => Array.isArray(streams?.[metric.key]) && streams[metric.key].some((v) => Number.isFinite(v) && v > 0));
  const shown = metrics.filter((metric) => !hidden[metric.key]);
  const chartHeight = 78;

  if (t.length < 2 || !metrics.length) return null;

  const pick = (x) => {
    if (!width) return;
    const sec = Math.max(0, Math.min(totalSeconds, (x / width) * totalSeconds));
    let best = 0;
    for (let i = 1; i < t.length; i += 1) if (Math.abs(t[i] - sec) < Math.abs(t[best] - sec)) best = i;
    setCursor(best);
  };
  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: (event, gesture) => !gesture || Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onResponderGrant: (event) => pick(event.nativeEvent.locationX),
    onResponderMove: (event) => pick(event.nativeEvent.locationX),
    // trascinando in verticale la pagina continua a scorrere
    onResponderTerminationRequest: () => true,
  };
  const distanceAt = (i) => (Array.isArray(streams.d) && Number.isFinite(streams.d[i]) ? `${(streams.d[i] / 1000).toFixed(2)} km` : null);

  return (
    <View>
      {/* valori nel punto del cursore (o medie) */}
      <View style={styles.readout}>
        <Text style={styles.readoutTime}>{cursor !== null ? fmtClock(t[cursor]) : 'Medie'}{cursor !== null && distanceAt(cursor) ? ` · ${distanceAt(cursor)}` : ''}</Text>
        <View style={styles.readoutValues}>
          {metrics.map((metric) => {
            const values = streams[metric.key];
            const valid = values.filter((v) => Number.isFinite(v) && v > 0);
            const value = cursor !== null ? values[cursor] : (valid.reduce((a, b) => a + b, 0) / (valid.length || 1));
            return (
              <Pressable key={metric.key} onPress={() => setHidden((current) => ({ ...current, [metric.key]: !current[metric.key] }))} style={[styles.readoutItem, hidden[metric.key] && { opacity: 0.35 }]}>
                <View style={[styles.readoutDot, { backgroundColor: metric.color }]} />
                <Text style={styles.readoutLabel}>{metric.short}</Text>
                <Text style={[styles.readoutValue, { color: metric.color }]}>{Number.isFinite(value) && value > 0 ? metric.format(value) : '—'}</Text>
                <Text style={styles.readoutUnit}>{metric.unit}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.chartsBox} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} {...responder}>
        {width > 0 && shown.map((metric, index) => (
          <View key={metric.key} style={[styles.chartRow, index > 0 && styles.chartDivider]} pointerEvents="none">
            <MetricChart metric={metric} t={t} values={streams[metric.key]} width={width} height={chartHeight} cursor={cursor} totalSeconds={totalSeconds} />
            <Text style={[styles.chartName, { color: metric.color }]}>{metric.label}</Text>
          </View>
        ))}
        {cursor !== null && width > 0 && (
          <View pointerEvents="none" style={[styles.cursorLine, { left: (t[cursor] / totalSeconds) * width }]} />
        )}
      </View>
      <View style={styles.xAxis}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <Text key={f} style={[styles.xLabel, { left: `${f * 100}%`, transform: [{ translateX: f === 0 ? 0 : f === 1 ? -40 : -20 }] }]}>{fmtClock(totalSeconds * f)}</Text>
        ))}
      </View>
      <Text style={styles.hint}>Tocca o trascina sul grafico per leggere i valori · tocca una metrica per mostrarla/nasconderla</Text>
    </View>
  );
}

export function LapsTable({ laps = [], sport }) {
  if (!laps.length) return null;
  const base = sport === 'nuoto' ? 100 : 1000;
  const usesPace = sport === 'corsa' || sport === 'nuoto';
  return (
    <View>
      <View style={[styles.lapRow, styles.lapHead]}>
        {['#', 'Tempo', 'Distanza', usesPace ? 'Passo' : 'Vel.', 'FC', 'FC max'].map((label, i) => (
          <Text key={label} style={[styles.lapCell, i === 0 && styles.lapIndex, styles.lapHeadText]}>{label}</Text>
        ))}
      </View>
      {laps.map((lap, i) => {
        const speed = lap.velocita || (lap.secondi ? lap.metri / lap.secondi : 0);
        return (
          <View key={i} style={[styles.lapRow, i % 2 === 1 && { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.lapCell, styles.lapIndex]}>{i + 1}</Text>
            <Text style={styles.lapCell}>{fmtClock(lap.secondi)}</Text>
            <Text style={styles.lapCell}>{lap.metri >= 1000 ? `${(lap.metri / 1000).toFixed(2)} km` : `${lap.metri} m`}</Text>
            <Text style={[styles.lapCell, { fontWeight: '800' }]}>{usesPace ? fmtPace(speed, base) : (speed * 3.6).toFixed(1)}</Text>
            <Text style={styles.lapCell}>{lap.fc_media || '—'}</Text>
            <Text style={styles.lapCell}>{lap.fc_max || '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  readoutTime: { fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 4 },
  readoutValues: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  readoutItem: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  readoutDot: { width: 8, height: 8, borderRadius: 4, alignSelf: 'center' },
  readoutLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  readoutValue: { fontSize: 15, fontWeight: '800' },
  readoutUnit: { fontSize: 10, color: colors.textMuted },
  chartsBox: { position: 'relative', backgroundColor: '#fbfcfe', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  chartRow: { position: 'relative' },
  chartDivider: { borderTopWidth: 1, borderTopColor: '#eef1f6' },
  chartName: { position: 'absolute', right: 6, top: 3, fontSize: 9, fontWeight: '800', opacity: 0.8 },
  axisLabel: { position: 'absolute', left: 4, fontSize: 9, color: colors.textMuted },
  avgLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', opacity: 0.45 },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: '#fff' },
  cursorLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#0f172a', opacity: 0.6 },
  xAxis: { height: 16, position: 'relative', marginTop: 2 },
  xLabel: { position: 'absolute', width: 40, fontSize: 9, color: colors.textMuted },
  hint: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoneKey: { width: 24, fontSize: 12, fontWeight: '800', color: colors.text },
  zoneRange: { width: 58, fontSize: 10, color: colors.textMuted },
  zoneTrack: { flex: 1, height: 12, backgroundColor: colors.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
  zoneFill: { height: 12, borderRadius: 3 },
  zoneValue: { width: 48, textAlign: 'right', fontSize: 11, fontWeight: '700', color: colors.text },
  zonePct: { width: 34, textAlign: 'right', fontSize: 11, color: colors.textMuted },
  lapRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4 },
  lapHead: { borderBottomWidth: 1, borderBottomColor: colors.border },
  lapHeadText: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  lapCell: { flex: 1, fontSize: 12, color: colors.text, textAlign: 'right' },
  lapIndex: { flex: 0.4, textAlign: 'left', color: colors.textMuted },
});
