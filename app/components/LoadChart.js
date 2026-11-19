import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../theme';

// Grafico CoachPeaking: carico acuto (blu), carico cronico (magenta), performance (istogramma giallo).
// Disegnato solo con View (nessuna dipendenza SVG) per funzionare su web, Android e iOS.
const ACUTE = '#2563eb';
const CHRONIC = '#c026d3';
const PERF = '#facc15';
const PERF_NEG = '#eab308';

function Segment({ x1, y1, x2, y2, color, faded }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!length) return null;
  const angle = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - 1,
        width: length,
        height: 2,
        backgroundColor: color,
        opacity: faded ? 0.35 : 1,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}

// markerDate (YYYY-MM-DD): evidenzia un giorno, ad es. quello dell'allenamento aperto.
export default function LoadChart({ series = [], height = 170, markerDate = null, markerLabel = 'allenamento' }) {
  const [width, setWidth] = useState(0);
  const lineHeight = Math.round(height * 0.62);
  const barHeight = height - lineHeight;

  const geometry = useMemo(() => {
    if (!width || series.length < 2) return null;
    const step = width / series.length;
    const maxLine = Math.max(10, ...series.map((p) => Math.max(p.acuto, p.cronico)));
    const maxPerf = Math.max(5, ...series.map((p) => Math.abs(p.performance)));
    const xFor = (i) => step * i + step / 2;
    const yLine = (v) => 6 + (lineHeight - 12) * (1 - v / maxLine);
    return { step, maxLine, maxPerf, xFor, yLine };
  }, [width, series, lineHeight]);

  const todayIndex = series.findIndex((p) => p.proiezione) - 1;
  const markerIndex = markerDate ? series.findIndex((p) => p.data === markerDate) : -1;

  return (
    <View>
      <View style={[styles.canvas, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {geometry && (
          <>
            {/* griglia orizzontale */}
            {[0.25, 0.5, 0.75].map((f) => (
              <View key={f} style={[styles.gridLine, { top: 6 + (lineHeight - 12) * f }]} />
            ))}
            <Text style={[styles.axisLabel, { top: 0 }]}>{Math.round(geometry.maxLine)}</Text>
            {/* linea dello zero della performance */}
            <View style={[styles.zeroLine, { top: lineHeight + barHeight / 2 }]} />
            {series.map((p, i) => {
              const h = (Math.abs(p.performance) / geometry.maxPerf) * (barHeight / 2 - 2);
              const top = p.performance >= 0 ? lineHeight + barHeight / 2 - h : lineHeight + barHeight / 2;
              return (
                <View
                  key={`b${p.data}`}
                  style={{
                    position: 'absolute',
                    left: geometry.xFor(i) - Math.max(1, geometry.step * 0.35),
                    width: Math.max(2, geometry.step * 0.7),
                    top,
                    height: Math.max(1, h),
                    backgroundColor: p.performance >= 0 ? PERF : PERF_NEG,
                    opacity: p.proiezione ? 0.4 : 0.9,
                    borderRadius: 1,
                  }}
                />
              );
            })}
            {series.slice(1).map((p, idx) => {
              const prev = series[idx];
              const i = idx + 1;
              return (
                <React.Fragment key={`l${p.data}`}>
                  <Segment x1={geometry.xFor(i - 1)} y1={geometry.yLine(prev.cronico)} x2={geometry.xFor(i)} y2={geometry.yLine(p.cronico)} color={CHRONIC} faded={p.proiezione} />
                  <Segment x1={geometry.xFor(i - 1)} y1={geometry.yLine(prev.acuto)} x2={geometry.xFor(i)} y2={geometry.yLine(p.acuto)} color={ACUTE} faded={p.proiezione} />
                </React.Fragment>
              );
            })}
            {markerIndex >= 0 && (
              <View style={[styles.markerBand, { left: geometry.xFor(markerIndex) - Math.max(2, geometry.step / 2), width: Math.max(4, geometry.step) }]}>
                <Text style={[styles.markerText, markerIndex > series.length * 0.7 && { right: 4, left: undefined }]}>{markerLabel}</Text>
              </View>
            )}
            {todayIndex >= 0 && (
              <View style={[styles.todayLine, { left: geometry.xFor(todayIndex) + geometry.step / 2 }]}>
                <Text style={styles.todayText}>oggi</Text>
              </View>
            )}
          </>
        )}
        {series.length < 2 && <Text style={styles.empty}>Dati insufficienti per il grafico</Text>}
      </View>
      {geometry && (
        <View style={styles.xAxis}>
          {series.map((p, i) => (i % 7 === 0 ? (
            <Text key={`x${p.data}`} style={[styles.xLabel, { left: geometry.xFor(i) - 16 }]}>
              {`${p.data.slice(8, 10)}/${p.data.slice(5, 7)}`}
            </Text>
          ) : null))}
        </View>
      )}
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: ACUTE }]} /><Text style={styles.legendText}>Carico acuto</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: CHRONIC }]} /><Text style={styles.legendText}>Carico cronico</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: PERF }]} /><Text style={styles.legendText}>Performance</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: colors.textMuted, opacity: 0.4 }]} /><Text style={styles.legendText}>Proiezione</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'relative', overflow: 'hidden', backgroundColor: '#fbfcfe', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#eef1f6' },
  zeroLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#cbd5e1' },
  axisLabel: { position: 'absolute', left: 4, fontSize: 9, color: colors.textMuted },
  todayLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#94a3b8' },
  markerBand: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(249,115,22,0.18)', borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(249,115,22,0.55)' },
  markerText: { position: 'absolute', top: 12, left: 4, fontSize: 9, fontWeight: '800', color: '#c2410c', width: 80 },
  todayText: { position: 'absolute', top: 2, left: 3, fontSize: 9, color: colors.textMuted },
  empty: { textAlign: 'center', marginTop: 60, color: colors.textMuted, fontSize: 12 },
  xAxis: { height: 16, position: 'relative' },
  xLabel: { position: 'absolute', width: 32, textAlign: 'center', fontSize: 9, color: colors.textMuted, top: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLine: { width: 14, height: 2 },
  legendBox: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
});
