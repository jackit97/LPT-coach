import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

// Maniglia per trascinare + frecce su/giu' (utili anche per chi non riesce a trascinare)
export default function ReorderHandle({ handleProps = {}, moveUp, moveDown }) {
  const { style: handleStyle, ...handlers } = handleProps;
  return (
    <View style={styles.wrap}>
      <Pressable onPress={moveUp || undefined} disabled={!moveUp} hitSlop={4} accessibilityLabel="Sposta su" style={styles.arrow}>
        <Ionicons name="chevron-up" size={16} color={moveUp ? colors.primary : colors.border} />
      </Pressable>
      <View {...handlers} style={[styles.grip, handleStyle]} accessibilityLabel="Trascina per spostare">
        <Ionicons name="reorder-three" size={22} color={colors.textMuted} />
      </View>
      <Pressable onPress={moveDown || undefined} disabled={!moveDown} hitSlop={4} accessibilityLabel="Sposta giù" style={styles.arrow}>
        <Ionicons name="chevron-down" size={16} color={moveDown ? colors.primary : colors.border} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', width: 30 },
  arrow: { paddingVertical: 1 },
  grip: { paddingVertical: 4, paddingHorizontal: 2 },
});
