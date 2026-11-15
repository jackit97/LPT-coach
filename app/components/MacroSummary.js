import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { MACRO_COLORS } from '../utils/nutrition';

const ROWS = [
  { key: 'kcal', label: 'Kcal', unit: '' },
  { key: 'proteins', label: 'Proteine', unit: 'g' },
  { key: 'carbs', label: 'Carboidrati', unit: 'g' },
  { key: 'fat', label: 'Grassi', unit: 'g' },
];

// Totali del giorno (o del pasto) rispetto al target, con barra di avanzamento per ogni macro.
export default function MacroSummary({ macros, target, compact }) {
  return (
    <View style={[styles.grid, compact && styles.gridCompact]}>
      {ROWS.map((row) => {
        const value = Math.round(macros?.[row.key] || 0);
        const goal = target?.[row.key] ? Math.round(target[row.key]) : null;
        const pct = goal ? value / goal : null;
        const off = pct !== null && (pct < 0.9 || pct > 1.1);
        return (
          <View key={row.key} style={styles.cell}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={[styles.value, { color: row.key === 'kcal' ? colors.text : MACRO_COLORS[row.key] }]}>
              {value}{row.unit}
              {goal ? <Text style={styles.goal}> / {goal}{row.unit}</Text> : null}
            </Text>
            {goal ? (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, (pct || 0) * 100)}%`, backgroundColor: off ? colors.warning : MACRO_COLORS[row.key] }]} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// Barra unica con la ripartizione percentuale delle calorie tra i macro.
export function MacroSplitBar({ macros }) {
  const p = (macros?.proteins || 0) * 4;
  const c = (macros?.carbs || 0) * 4;
  const f = (macros?.fat || 0) * 9;
  const total = p + c + f;
  if (!total) return null;
  const parts = [['proteins', p, 'P'], ['carbs', c, 'C'], ['fat', f, 'G']];
  return (
    <View>
      <View style={styles.split}>
        {parts.map(([key, value]) => <View key={key} style={{ flex: value || 0.0001, backgroundColor: MACRO_COLORS[key] }} />)}
      </View>
      <View style={styles.splitLegend}>
        {parts.map(([key, value, letter]) => (
          <Text key={key} style={[styles.splitText, { color: MACRO_COLORS[key] }]}>{letter} {Math.round((value / total) * 100)}%</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCompact: { gap: spacing.xs },
  cell: { flexGrow: 1, flexBasis: '22%', minWidth: 120, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: radius.md, padding: spacing.sm },
  label: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  goal: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 6, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  split: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.border },
  splitLegend: { flexDirection: 'row', gap: spacing.md, marginTop: 4 },
  splitText: { fontSize: 11, fontWeight: '800' },
});
