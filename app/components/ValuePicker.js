import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

const ITEM_H = 44;
const VISIBLE = 5;
const PAD = Math.floor(VISIBLE / 2) * ITEM_H;

function optionsFor(unit, field) {
  if (field === 'serie' || field === 'ripetizioni' || field === 'repeats' || unit === 'ripetizioni') return Array.from({ length: 100 }, (_, index) => String(index + 1));
  if (unit === 'm' || unit === 'metri') return Array.from({ length: 50 }, (_, index) => String((index + 1) * 100));
  if (unit === 'km' || unit === 'chilometri') return Array.from({ length: 84 }, (_, index) => String(0.5 + index * 0.5));
  if (unit === 'min' || unit === 'minuti') return [...Array.from({ length: 59 }, (_, index) => `00:${String(index + 1).padStart(2, '0')}`), ...Array.from({ length: 180 }, (_, index) => String(index + 1))];
  return [];
}

function optionLabel(option, unit) {
  if (unit === 'm' || unit === 'metri') return `${option} m`;
  if (unit === 'km' || unit === 'chilometri') return `${option} km`;
  if (unit === 'min' || unit === 'minuti') return option.includes(':') ? `${option} (sec)` : `${option} min`;
  return option;
}

// Selettore verticale "a rullo": la riga centrale è quella selezionata.
export default function ValuePicker({ value, unit, field, label = 'Valore', onChange, style, compact = false }) {
  const [visible, setVisible] = useState(false);
  const [custom, setCustom] = useState('');
  const options = useMemo(() => optionsFor(unit, field), [unit, field]);
  const initialIndex = Math.max(0, options.indexOf(String(value ?? '')));
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef(null);
  const settleTimer = useRef(null);
  const allowText = field === 'ripetizioni' || unit === 'ripetizioni';
  const integerOnly = field === 'serie' || field === 'repeats';

  const open = () => {
    const start = Math.max(0, options.indexOf(String(value ?? '')));
    setIndex(start);
    setCustom(options.includes(String(value ?? '')) ? '' : String(value ?? ''));
    setVisible(true);
  };

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: index * ITEM_H, animated: false }), 30);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const clampIndex = (y) => Math.min(options.length - 1, Math.max(0, Math.round(y / ITEM_H)));
  const onScroll = (event) => {
    const y = event.nativeEvent.contentOffset.y;
    setIndex(clampIndex(y));
    if (Platform.OS === 'web') {
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => scrollRef.current?.scrollTo({ y: clampIndex(y) * ITEM_H, animated: true }), 120);
    }
  };
  const goTo = (target) => { setIndex(target); scrollRef.current?.scrollTo({ y: target * ITEM_H, animated: true }); };

  const close = () => { clearTimeout(settleTimer.current); setVisible(false); };
  const choose = (nextValue) => { onChange(String(nextValue)); close(); };
  const confirm = () => {
    if (custom.trim()) choose(custom.trim().slice(0, 15));
    else if (options[index] !== undefined) choose(options[index]);
  };

  return <>
    <Pressable style={[styles.button, compact && styles.buttonCompact, style]} onPress={open}>
      <Text numberOfLines={1} style={[styles.value, compact && styles.valueCompact]}>{value || label}</Text>
      <View style={styles.chevronBox}><Text style={styles.chevron}>▼</Text></View>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.card}>
          <Text style={styles.title}>{label}</Text>
          {options.length > 0 && <View style={styles.wheel}>
            <View pointerEvents="none" style={styles.highlight} />
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              snapToInterval={ITEM_H}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={onScroll}
              contentContainerStyle={{ paddingVertical: PAD }}
              style={styles.wheelScroll}
            >
              {options.map((option, i) => {
                const distance = Math.abs(i - index);
                return <Pressable key={option} style={styles.item} onPress={() => (i === index ? confirm() : goTo(i))}>
                  <Text style={[styles.itemText, distance === 0 && styles.itemSelected, distance === 1 && styles.itemNear, distance > 1 && styles.itemFar]}>{optionLabel(option, unit)}</Text>
                </Pressable>;
              })}
            </ScrollView>
          </View>}
          <Text style={styles.customLabel}>{allowText ? 'Oppure scrivi (es. intervallo)' : 'Oppure scrivi un valore'}</Text>
          <TextInput
            value={custom}
            onChangeText={(text) => setCustom((integerOnly ? text.replace(/\D/g, '') : text).slice(0, 15))}
            keyboardType={allowText ? 'default' : integerOnly ? 'number-pad' : 'decimal-pad'}
            style={styles.customInput}
            onSubmitEditing={confirm}
          />
          {allowText && <Text style={styles.hint}>Puoi indicare un intervallo come 4-6 o 8-10.</Text>}
          {(unit === 'min' || unit === 'minuti') && <Text style={styles.hint}>Per minuti e secondi usa il formato MM:SS, ad esempio 5:30.</Text>}
          <View style={styles.actions}>
            <Pressable style={[styles.actionButton, styles.cancel]} onPress={close}><Text style={styles.cancelText}>Annulla</Text></Pressable>
            <Pressable style={[styles.actionButton, styles.ok]} onPress={confirm}><Text style={styles.okText}>Conferma</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  button: { minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingLeft: spacing.sm, paddingRight: 2, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  buttonCompact: { minHeight: 30, paddingLeft: 6 },
  value: { color: colors.text, flex: 1, flexShrink: 1 }, valueCompact: { fontWeight: '700', textAlign: 'center' },
  chevronBox: { width: 20, height: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, chevron: { color: colors.textMuted, fontSize: 9, lineHeight: 12 },
  overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.sm, textAlign: 'center' },
  wheel: { height: ITEM_H * VISIBLE, position: 'relative', marginBottom: spacing.sm },
  wheelScroll: { height: ITEM_H * VISIBLE },
  highlight: { position: 'absolute', left: 0, right: 0, top: PAD, height: ITEM_H, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight, borderRadius: radius.sm },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { color: colors.text, fontSize: 18 },
  itemSelected: { fontSize: 22, fontWeight: '800', color: colors.primary },
  itemNear: { opacity: 0.6 }, itemFar: { opacity: 0.3, fontSize: 16 },
  customLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  customInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, color: colors.text },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionButton: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  cancel: { borderWidth: 1, borderColor: colors.border }, cancelText: { color: colors.text, fontWeight: '700' },
  ok: { backgroundColor: colors.primary }, okText: { color: colors.textInverse, fontWeight: '700' },
});
