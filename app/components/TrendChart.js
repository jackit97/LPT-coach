import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

// Grafico a linea semplice (solo View, come LoadChart): points = [{ label, value }]
function Segment({ x1, y1, x2, y2, color }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!length) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - 1.5, width: length, height: 3, borderRadius: 2, backgroundColor: color, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
}

const fmt = (value, digits) => (value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace('.', ','));

export default function TrendChart({ points = [], color = colors.primary, unit = '', digits = 1, height = 170, lowerIsBetter = false }) {
  const [width, setWidth] = useState(0);
  const data = points.filter((point) => point.value !== null && point.value !== undefined && Number.isFinite(Number(point.value)));
  if (data.length < 2) {
    return <View style={styles.empty}><Text style={styles.emptyText}>{data.length === 1 ? `Un solo valore: ${fmt(data[0].value, digits)} ${unit}. Il grafico compare dalla seconda misurazione.` : 'Nessun dato per questa misura.'}</Text></View>;
  }
  const values = data.map((point) => Number(point.value));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-6) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;
  const left = 44;
  const right = 14;
  const top = 18;
  const bottom = 26;
  const plotW = Math.max(10, width - left - right);
  const plotH = height - top - bottom;
  const x = (index) => left + (data.length === 1 ? plotW / 2 : (index * plotW) / (data.length - 1));
  const y = (value) => top + plotH - ((value - min) / (max - min)) * plotH;
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const showEvery = Math.ceil(data.length / 5);

  return (
    <View>
      <View style={{ height }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 && <>
          {[0, 0.5, 1].map((t) => {
            const value = max - (max - min) * t;
            return <View key={t} style={[styles.grid, { top: top + plotH * t, left }]}>
              <Text style={[styles.axis, { left: -left }]}>{fmt(value, digits)}</Text>
            </View>;
          })}
          {data.slice(1).map((point, index) => <Segment key={`s${index}`} x1={x(index)} y1={y(values[index])} x2={x(index + 1)} y2={y(values[index + 1])} color={color} />)}
          {data.map((point, index) => <View key={`d${index}`} style={[styles.dot, { left: x(index) - 5, top: y(values[index]) - 5, borderColor: color }]} />)}
          <Text style={[styles.lastValue, { left: Math.min(width - 70, x(data.length - 1) - 35), top: Math.max(0, y(last) - 20), color }]}>{fmt(last, digits)}</Text>
          {data.map((point, index) => ((index % showEvery === 0 || index === data.length - 1) ? <Text key={`l${index}`} style={[styles.xLabel, { left: x(index) - 30, top: height - bottom + 6 }]}>{point.label}</Text> : null))}
        </>}
      </View>
      <Text style={[styles.summary, { color: Math.abs(delta) < 1e-9 ? colors.textMuted : good ? colors.success : colors.danger }]}>
        {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {fmt(Math.abs(delta), digits)} {unit} dalla prima misurazione ({fmt(first, digits)} → {fmt(last, digits)} {unit})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  grid: { position: 'absolute', right: 14, height: 1, backgroundColor: colors.border },
  axis: { position: 'absolute', top: -7, width: 40, textAlign: 'right', fontSize: 10, color: colors.textMuted },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 2, backgroundColor: '#fff' },
  lastValue: { position: 'absolute', width: 70, textAlign: 'center', fontSize: 12, fontWeight: '800' },
  xLabel: { position: 'absolute', width: 60, textAlign: 'center', fontSize: 10, color: colors.textMuted },
  summary: { fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
});
