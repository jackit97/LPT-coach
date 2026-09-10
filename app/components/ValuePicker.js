import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

function optionsFor(unit, field) {
  if (field === 'serie' || field === 'ripetizioni' || unit === 'ripetizioni') return Array.from({ length: 100 }, (_, index) => String(index + 1));
  if (unit === 'm' || unit === 'metri') return Array.from({ length: 9 }, (_, index) => String((index + 1) * 100));
  if (unit === 'km' || unit === 'chilometri') return Array.from({ length: 19 }, (_, index) => String(1 + index * 0.5));
  if (unit === 'min' || unit === 'minuti') return [...Array.from({ length: 60 }, (_, index) => String(index + 1)), ...Array.from({ length: 60 }, (_, index) => `00:${String(index + 1).padStart(2, '0')}`)];
  return [];
}

export default function ValuePicker({ value, unit, field, label = 'Valore', onChange, style }) {
  const [visible, setVisible] = useState(false);
  const [custom, setCustom] = useState(String(value || ''));
  const options = useMemo(() => optionsFor(unit, field), [unit, field]);
  const choose = (nextValue) => { onChange(String(nextValue)); setCustom(String(nextValue)); setVisible(false); };
  const submitCustom = () => { if (custom.trim()) choose(custom.trim()); };

  return <>
    <Pressable style={[styles.button, style]} onPress={() => { setCustom(String(value || '')); setVisible(true); }}>
      <Text numberOfLines={1} style={styles.value}>{value || label}</Text>
      <View style={styles.chevronBox}><Text style={styles.chevron}>▼</Text></View>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
        <View style={styles.card}>
          <Text style={styles.title}>{label}</Text>
          <View style={styles.customRow}>
            <TextInput value={custom} onChangeText={setCustom} keyboardType="decimal-pad" style={styles.customInput} placeholder="Personalizzato" />
            <Pressable style={styles.customButton} onPress={submitCustom}><Text style={styles.customText}>Usa</Text></Pressable>
          </View>
          <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>
            {options.map((option) => <Pressable key={option} style={[styles.option, String(value) === option && styles.selected]} onPress={() => choose(option)}><Text style={styles.optionText}>{unit === 'm' || unit === 'metri' ? `${option} m` : unit === 'km' || unit === 'chilometri' ? `${option} km` : unit === 'min' || unit === 'minuti' ? (option.includes(':') ? option : `${option} min`) : option}</Text></Pressable>)}
          </ScrollView>
          {(unit === 'min' || unit === 'minuti') && <Text style={styles.hint}>Per i secondi usa il formato MM:SS, ad esempio 5:30.</Text>}
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  button: { minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingLeft: spacing.sm, paddingRight: 2, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  value: { color: colors.text, flex: 1, flexShrink: 1 }, chevronBox: { width: 24, height: 30, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, chevron: { color: colors.textMuted, fontSize: 10, lineHeight: 12 },
  overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: spacing.xl },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: { maxHeight: '80%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.sm },
  customRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }, customInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }, customButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, justifyContent: 'center' }, customText: { color: colors.textInverse, fontWeight: '700' },
  options: { maxHeight: 360 }, optionsContent: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, option: { minWidth: 70, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, alignItems: 'center' }, selected: { borderColor: colors.primary, backgroundColor: colors.primaryLight }, optionText: { color: colors.text, fontWeight: '600' }, hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
});
