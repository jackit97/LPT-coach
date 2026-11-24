import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { colors, spacing, radius, typography } from '../theme';

const fmtDate = (value) => new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

// Coach: report degli allenamenti di forza inviati dagli atleti (video di esecuzione, dubbi, feedback)
export default function ReportsScreen({ navigation, route }) {
  const athleteFilter = route?.params?.utenteId || null;
  const athleteName = route?.params?.athleteName || null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('tutti');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/reports', { params: athleteFilter ? { utenteId: athleteFilter } : {} });
      setItems(data || []);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.message || 'Impossibile caricare i report');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [athleteFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unread = items.filter((item) => !item.letto_at).length;
  const shown = filter === 'da_leggere' ? items.filter((item) => !item.letto_at) : items;

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <View style={styles.screen}>
      {!!athleteFilter && (
        <View style={styles.athleteBar}>
          <Ionicons name="person" size={14} color={colors.primary} />
          <Text style={styles.athleteBarText} numberOfLines={1}>Solo {athleteName || 'questo atleta'}</Text>
          <Pressable onPress={() => navigation.setParams({ utenteId: null, athleteName: null })} hitSlop={6}>
            <Text style={styles.athleteBarLink}>Mostra tutti</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.filters}>
        {[['tutti', `Tutti (${items.length})`], ['da_leggere', `Da leggere (${unread})`]].map(([key, label]) => (
          <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filter, filter === key && styles.filterActive]}>
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(item) => String(item.report_id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {error || (filter === 'da_leggere' ? 'Nessun report da leggere.' : 'Nessun report ricevuto. Gli atleti possono inviartelo quando segnano completato un allenamento di forza.')}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, !item.letto_at && styles.cardUnread, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('ReportDetail', { reportId: item.report_id })}
          >
            <View style={styles.cardHeader}>
              {!item.letto_at && <View style={styles.dot} />}
              <Text style={styles.athlete} numberOfLines={1}>{item.atleta}</Text>
              <Text style={styles.date}>{fmtDate(item.inviato_at)}</Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{item.titolo}</Text>
            <View style={styles.chips}>
              <Text style={styles.chip}>📅 {String(item.data).slice(0, 10).split('-').reverse().slice(0, 2).join('/')}</Text>
              {item.n_video > 0 && <Text style={styles.chip}>🎥 {item.n_video} video</Text>}
              {item.n_dubbi > 0 && <Text style={[styles.chip, styles.chipDoubt]}>❓ {item.n_dubbi} {item.n_dubbi === 1 ? 'dubbio' : 'dubbi'}</Text>}
              {!!item.rpe && <Text style={styles.chip}>RPE {item.rpe}</Text>}
              {!!item.nuovi_messaggi && <Text style={[styles.chip, styles.chipNew]}>💬 Nuovo messaggio</Text>}
              {!!item.risposta_at && <Text style={[styles.chip, styles.chipDone]}>✓ Risposto</Text>}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chipNew: { color: '#fff', backgroundColor: colors.danger, borderColor: colors.danger, overflow: 'hidden' },
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  athleteBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.primaryLight, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  athleteBarText: { flex: 1, color: colors.primary, fontWeight: '700' },
  athleteBarLink: { color: colors.primary, fontWeight: '800', textDecorationLine: 'underline' },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  filter: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardUnread: { borderColor: colors.primary, borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  athlete: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  date: { ...typography.caption },
  title: { fontSize: 14, color: colors.text, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  chip: { fontSize: 11, fontWeight: '700', color: colors.primary, backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  chipDoubt: { color: '#92400E', backgroundColor: '#FEF3C7' },
  chipDone: { color: colors.success, backgroundColor: '#DCFCE7' },
  empty: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl * 2, paddingHorizontal: spacing.lg },
  emptyText: { ...typography.caption, textAlign: 'center' },
});
