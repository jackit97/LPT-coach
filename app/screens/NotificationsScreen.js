import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import { useNotifications } from '../context/NotificationsContext';
import { colors, spacing, radius, typography } from '../theme';

const TYPE_STYLE = {
  workout: { icon: 'barbell', color: '#2563EB' },
  feedback: { icon: 'chatbox-ellipses', color: '#16A34A' },
  dieta: { icon: 'restaurant', color: '#DB2777' },
  pagamento: { icon: 'card', color: '#EA580C' },
  check_richiesto: { icon: 'camera', color: '#B45309' },
  check_inviato: { icon: 'images', color: '#1D4ED8' },
  check_commentato: { icon: 'chatbubbles', color: '#047857' },
  strava: { icon: 'flash', color: '#FC4C02' },
  report: { icon: 'document-text', color: '#9333EA' },
  report_risposta: { icon: 'chatbubbles', color: '#9333EA' },
  consiglio: { icon: 'bulb', color: '#F59E0B' },
  feedback: { icon: 'chatbox-ellipses', color: '#7C3AED' },
};

// Schermata di destinazione -> tab che la contiene
const TARGET_TABS = {
  WorkoutDetail: 'CalendarTab',
  DietDetail: 'DietsTab',
  CheckDetail: 'ChecksTab',
  ReportDetail: 'ReportsTab',
  AthleteHome: 'HomeTab',
  StrengthHome: 'StrengthTab',
  PaymentsHome: 'PaymentsTab',
  DevFeedback: 'DevFeedbackTab',
};

function timeAgo(value) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'ora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h fa`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} g fa`;
  return new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

export default function NotificationsScreen({ navigation }) {
  const { clients, setSelectedAthlete } = useAthlete();
  const { setUnread } = useNotifications();
  const { dietEnabled } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications');
      setItems(data?.items || []);
      setUnread(data?.unread || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setUnread]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markAll = async () => {
    await api.post('/notifications/read-all').catch(() => {});
    setItems((current) => current.map((item) => ({ ...item, letta: true })));
    setUnread(0);
  };

  const openItem = async (item) => {
    if (!item.letta) {
      api.post(`/notifications/${item.notifica_id}/read`).catch(() => {});
      setItems((current) => current.map((row) => (row.notifica_id === item.notifica_id ? { ...row, letta: true } : row)));
      setUnread((count) => Math.max(0, count - 1));
    }
    const link = item.link;
    if (!link?.screen) return;
    // Per il coach: seleziona l'atleta a cui si riferisce la notifica
    if (link.params?.athleteId) {
      const client = clients.find((row) => row.utenteid === link.params.athleteId);
      if (client) setSelectedAthlete(client);
    }
    // risposta a una segnalazione: si apre la pagina Feedback nello stack attuale
    if (link.screen === 'Feedback') { navigation.navigate('Feedback'); return; }
    const tab = TARGET_TABS[link.screen];
    if (tab === 'DietsTab' && !dietEnabled) return; // sezione dieta nascosta dal coach
    if (tab) navigation.navigate(tab, { screen: link.screen, params: link.params || {}, initial: false });
  };

  const unreadCount = items.filter((item) => !item.letta).length;

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarText}>{unreadCount ? `${unreadCount} da leggere` : 'Tutto letto'}</Text>
        {unreadCount > 0 && (
          <Pressable onPress={markAll} style={styles.markAll}>
            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
            <Text style={styles.markAllText}>Segna tutte come lette</Text>
          </Pressable>
        )}
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.notifica_id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nessuna notifica per ora.</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const style = TYPE_STYLE[item.tipo] || { icon: 'notifications', color: colors.primary };
            return (
              <Pressable style={({ pressed }) => [styles.row, !item.letta && styles.rowUnread, pressed && { opacity: 0.8 }]} onPress={() => openItem(item)}>
                <View style={[styles.iconWrap, { backgroundColor: `${style.color}1A` }]}>
                  <Ionicons name={style.icon} size={20} color={style.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, !item.letta && { fontWeight: '800' }]}>{item.titolo}</Text>
                  {!!item.messaggio && <Text style={styles.message} numberOfLines={3}>{item.messaggio}</Text>}
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.letta && <View style={styles.dot} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  toolbarText: { ...typography.caption, fontWeight: '700' },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  markAllText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  list: { padding: spacing.md, maxWidth: 760, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  rowUnread: { borderColor: colors.primary, backgroundColor: '#F5F8FF' },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  message: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 4 },
  empty: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.caption },
});
