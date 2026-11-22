import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/client';
import { fmtAgo } from './DevDashboardScreen';
import { colors, spacing, radius } from '../../theme';

// Errori del server (worker) e dell'app, raggruppati per messaggio
export default function DevErrorsScreen() {
  const [rows, setRows] = useState([]);
  const [all, setAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    try { const { data } = await api.get('/dev/errors', { params: { stato: all ? 'tutti' : 'aperti' } }); setRows(data || []); } catch { setRows([]); } finally { setLoading(false); }
  }, [all]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const groups = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const key = `${row.origine}|${row.messaggio}`;
      if (!map.has(key)) map.set(key, { key, origine: row.origine, messaggio: row.messaggio, items: [] });
      map.get(key).items.push(row);
    }
    return [...map.values()];
  }, [rows]);

  const resolve = async (group) => {
    try { await api.post('/dev/errors/resolve', { messaggio: group.messaggio }); load(); } catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Operazione non riuscita'); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <View style={styles.toolbar}>
        <Text style={styles.title}>{all ? 'Tutti gli errori' : 'Errori da risolvere'} ({rows.length})</Text>
        <Pressable onPress={() => { setLoading(true); setAll((v) => !v); }}><Text style={styles.link}>{all ? 'Solo aperti' : 'Mostra tutti'}</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator color={colors.primary} /> : groups.length === 0 ? (
        <Text style={styles.empty}>Nessun errore {all ? 'registrato' : 'aperto'} 🎉</Text>
      ) : groups.map((group) => {
        const last = group.items[0];
        const users = [...new Set(group.items.map((item) => [item.nome, item.cognome].filter(Boolean).join(' ')).filter(Boolean))];
        const expanded = open === group.key;
        return (
          <View key={group.key} style={styles.card}>
            <Pressable onPress={() => setOpen(expanded ? null : group.key)}>
              <View style={styles.head}>
                <Text style={[styles.origin, group.origine === 'server' ? styles.server : styles.app]}>{group.origine === 'server' ? 'SERVER' : 'APP'}</Text>
                <Text style={styles.count}>×{group.items.length}</Text>
                <Text style={styles.ago}>{fmtAgo(last.created_at)}</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </View>
              <Text style={styles.message} numberOfLines={expanded ? undefined : 3}>{group.messaggio}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[last.metodo, last.percorso].filter(Boolean).join(' ')}{users.length ? ` · ${users.join(', ')}` : ''}
              </Text>
            </Pressable>
            {expanded && (
              <View style={styles.detail}>
                {!!last.stack && <Text style={styles.stack}>{last.stack}</Text>}
                <Text style={styles.meta}>{last.user_agent}</Text>
                {!!last.versione_app && <Text style={styles.meta}>Versione app: {last.versione_app}</Text>}
              </View>
            )}
            {group.items.some((item) => !item.risolto) && (
              <Pressable style={styles.resolve} onPress={() => resolve(group)}>
                <Ionicons name="checkmark-done" size={16} color={colors.success} />
                <Text style={styles.resolveText}>Segna risolto</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 960, width: '100%', alignSelf: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  link: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  origin: { fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', color: '#fff' },
  server: { backgroundColor: colors.danger },
  app: { backgroundColor: '#7C3AED' },
  count: { fontWeight: '800', color: colors.text },
  ago: { flex: 1, fontSize: 12, color: colors.textMuted, textAlign: 'right' },
  message: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  detail: { marginTop: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm },
  stack: { fontSize: 11, color: colors.text, fontFamily: 'monospace' },
  resolve: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: spacing.sm },
  resolveText: { color: colors.success, fontWeight: '800' },
});
