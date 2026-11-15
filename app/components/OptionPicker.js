import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

// Selettore a lista compatibile con web, Android e iOS (sostituisce i <select> HTML).
// options: [{ value, label, color? }]
export default function OptionPicker({ value, options, onChange, title = 'Seleziona', style, textStyle, renderLabel, children }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <>
      <Pressable style={style} onPress={() => setOpen(true)} hitSlop={4}>
        {children || (
          <Text style={textStyle} numberOfLines={1}>{renderLabel ? renderLabel(current) : (current?.label ?? String(value ?? ''))} ▾</Text>
        )}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((option) => (
                <Pressable
                  key={String(option.value)}
                  style={[styles.option, option.value === value && styles.optionActive]}
                  onPress={() => { onChange(option.value); setOpen(false); }}
                >
                  {!!option.color && <View style={[styles.dot, { backgroundColor: option.color }]} />}
                  <Text style={styles.optionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  optionActive: { backgroundColor: colors.primaryLight },
  dot: { width: 12, height: 12, borderRadius: 3 },
  optionText: { color: colors.text, fontWeight: '600', fontSize: 14, flexShrink: 1 },
});
