import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { colors, radius, spacing } from '../theme';

// Scelta di un esercizio dal catalogo (tabella esercizifull), con possibilita' di crearne uno nuovo.
export default function ExercisePicker({ visible, onClose, onSelect, onUnlink, currentId, title = 'Scegli l\'esercizio' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/exercises', { params: { q: query.trim() } });
        if (!cancelled) setResults(data || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, visible]);

  const exact = results.some((item) => item.nome.trim().toLowerCase() === query.trim().toLowerCase());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={colors.textMuted} /></Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Cerca esercizio" style={{ flex: 1, paddingVertical: spacing.sm }} autoFocus />
          </View>
          {!!onUnlink && (
            <Pressable style={styles.create} onPress={onUnlink}>
              <Ionicons name="unlink-outline" size={20} color={colors.danger} />
              <Text style={[styles.createText, { color: colors.danger }]}>Scollega dall'esercizio attuale</Text>
            </Pressable>
          )}
          {!!query.trim() && !exact && (
            <Pressable style={styles.create} onPress={() => onSelect({ id: null, nome: query.trim() })}>
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.createText}>Aggiungi «{query.trim()}» al catalogo</Text>
            </Pressable>
          )}
          {loading ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.primary} /> : (
            <FlatList
              data={results}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 380 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>Nessun esercizio trovato.</Text>}
              renderItem={({ item }) => (
                <Pressable style={[styles.row, item.id === currentId && styles.rowCurrent]} onPress={() => onSelect(item)}>
                  <Ionicons name={item.id === currentId ? 'checkmark-circle' : 'barbell-outline'} size={18} color={item.id === currentId ? colors.success : colors.primary} />
                  <Text style={styles.rowText}>{item.nome}</Text>
                  {item.id === currentId && <Text style={styles.currentTag}>attuale</Text>}
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0006', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceAlt },
  create: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  createText: { color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
  rowCurrent: { backgroundColor: '#ECFDF5' },
  currentTag: { fontSize: 11, fontWeight: '800', color: colors.success },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
});
