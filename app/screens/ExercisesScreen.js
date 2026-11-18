import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { colors, spacing, radius, typography } from '../theme';

// Catalogo esercizi del coach (tabella esercizifull): aggiunta, rinomina, eliminazione.
// Gli esercizi del catalogo compaiono nella ricerca degli editor e servono per collegare i video.
export default function ExercisesScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(null);
  const [editing, setEditing] = useState(null); // { id, nome }
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async (q = query) => {
    try {
      const { data } = await api.get('/exercises/catalog', { params: { q: q.trim() } });
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const timer = setTimeout(() => load(query), 200);
    return () => clearTimeout(timer);
  }, [query, load]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setMessage(null);
    try {
      const { data } = await api.post('/exercises', { nome: name });
      setNewName('');
      setMessage({ ok: true, text: `"${data.nome}" aggiunto al catalogo` });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: e?.response?.data?.message || 'Impossibile aggiungere l\'esercizio' });
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item) => { setEditing(item); setEditName(item.nome); };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      await api.put(`/exercises/${editing.id}`, { nome: editName });
      setEditing(null);
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile rinominare');
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = (item) => {
    Alert.alert(
      'Elimina esercizio',
      `Togliere "${item.nome}" dal catalogo?${item.video_count ? `\n\nI ${item.video_count} video collegati resteranno nella libreria ma andranno ricollegati.` : ''}\nLe schede già assegnate non vengono modificate.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Elimina', style: 'destructive', onPress: async () => {
          try { await api.delete(`/exercises/${item.id}`); await load(); }
          catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Impossibile eliminare'); }
        } },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.label}>Nuovo esercizio</Text>
        <View style={styles.addRow}>
          <TextInput
            value={newName}
            onChangeText={(value) => { setNewName(value); setMessage(null); }}
            onSubmitEditing={add}
            placeholder="Nome esercizio"
            style={[styles.input, { flex: 1, minWidth: 0 }]}
            returnKeyType="done"
          />
          <Pressable style={[styles.addBtn, (!newName.trim() || adding) && { opacity: 0.5 }]} onPress={add} disabled={!newName.trim() || adding}>
            {adding ? <ActivityIndicator color="#fff" /> : <><Ionicons name="add" size={20} color="#fff" /><Text style={styles.addText}>Aggiungi</Text></>}
          </Pressable>
        </View>
        {!!message && <Text style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}>{message.text}</Text>}
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Cerca nel catalogo" style={{ flex: 1, paddingVertical: spacing.sm }} />
        </View>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.count}>{items.length} esercizi{query.trim() ? ' trovati' : ' nel catalogo'}</Text>}
          ListEmptyComponent={<Text style={styles.empty}>Nessun esercizio trovato.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Ionicons name="barbell-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.nome}</Text>
                {item.video_count > 0 ? (
                  <Text style={styles.videoInfo} numberOfLines={1}>▶ {item.video_count === 1 ? '1 video' : `${item.video_count} video`}: {item.video_titoli}</Text>
                ) : <Text style={styles.noVideo}>Nessun video collegato</Text>}
              </View>
              <Pressable onPress={() => startEdit(item)} hitSlop={8} style={styles.iconBtn} accessibilityLabel={`Rinomina ${item.nome}`}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </Pressable>
              <Pressable onPress={() => remove(item)} hitSlop={8} style={styles.iconBtn} accessibilityLabel={`Elimina ${item.nome}`}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>Rinomina esercizio</Text>
            <Text style={styles.hint}>Il nome viene aggiornato anche nelle schede, negli allenamenti e nei template dei tuoi atleti, così i video restano collegati.</Text>
            <TextInput value={editName} onChangeText={setEditName} style={[styles.input, { marginTop: spacing.md }]} placeholder="Nome esercizio" autoFocus />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setEditing(null)}><Text style={styles.secondaryText}>Annulla</Text></Pressable>
              <Pressable style={styles.primaryBtn} onPress={saveEdit} disabled={savingEdit || !editName.trim()}>
                {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Salva</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, padding: spacing.md, gap: spacing.sm },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase' },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt, fontSize: 15 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  addText: { color: '#fff', fontWeight: '800' },
  message: { fontSize: 12, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  list: { padding: spacing.md, paddingBottom: 60, maxWidth: 800, width: '100%', alignSelf: 'center' },
  count: { ...typography.caption, marginBottom: spacing.sm, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.xs },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  videoInfo: { fontSize: 12, color: '#DC2626', fontWeight: '600', marginTop: 2 },
  noVideo: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  iconBtn: { padding: 6 },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  overlay: { flex: 1, backgroundColor: '#0006', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 460, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 17 },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  primaryBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '700' },
});
