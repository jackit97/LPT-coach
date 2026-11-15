import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { ZONE_COLORS, rpeToZone } from '../utils/endurance';

// Scala RPE 1-10 colorata come le zone endurance, usata da forza/funzionale/feedback atleta.
export default function RpeSelector({ value, onChange }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: 10 }, (_, index) => index + 1).map((rpe) => {
        const active = Number(value) === rpe;
        const color = ZONE_COLORS[rpeToZone(rpe)];
        return (
          <Pressable
            key={rpe}
            onPress={() => onChange(active ? '' : String(rpe))}
            style={[styles.cell, { borderColor: color }, active && { backgroundColor: color }]}
          >
            <Text style={[styles.text, active && styles.textActive]}>{rpe}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cell: { width: 34, height: 34, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  text: { fontWeight: '800', color: colors.text },
  textActive: { color: '#111827' },
});
