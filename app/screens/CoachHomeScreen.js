import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';

const PRIORITY_COLORS = { alta: '#dc2626', media: '#d97706', bassa: '#64748b' };
export const fullName = (athlete) => [athlete?.nome, athlete?.cognome].filter(Boolean).join(' ') || 'Atleta';
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'AT';

// Home del coach: Coach Assistant (chi ha bisogno di attenzione) + elenco atleti. Toccando un atleta si apre la sua pagina.
export default function CoachHomeScreen({ navigation }) {
  const { user } = useAuth();
  const { clients, loadClients, loadingClients } = useAthlete();
  const [assistant, setAssistant] = useState(null);
  const [counts, setCounts] = useState({ reports: 0, checks: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const [alerts, reports, checks] = await Promise.all([
        api.get('/pt/alerts').then((r) => r.data).catch(() => null),
        api.get('/reports').then((r) => r.data || []).catch(() => []),
        api.get('/checks/inbox').then((r) => r.data || []).catch(() => []),
      ]);
      setAssistant(alerts);
      setCounts({ reports: reports.filter((item) => !item.letto_at).length, checks: checks.length });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); loadClients(); }, [load, loadClients]));

  const openAthlete = (athleteId) => navigation.navigate('AthleteHub', { athleteId });
  const withAlerts = (assistant?.athletes || []).filter((athlete) => athlete.alerts.length);
  const shownAlerts = showAll ? withAlerts : withAlerts.slice(0, 4);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((client) => !q || fullName(client).toLowerCase().includes(q) || String(client.email || '').toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); loadClients(); }} />}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.hello}>Ciao {String(user?.nome || '').split(' ')[0] || 'coach'} 👋</Text>
      <View style={styles.counters}>
        <Pressable style={styles.counter} onPress={() => navigation.navigate('ClientsTab')}>
          <Ionicons name="people" size={20} color={colors.primary} />
          <Text style={styles.counterValue}>{clients.length}</Text>
          <Text style={styles.counterLabel}>Atleti</Text>
        </Pressable>
        <Pressable style={styles.counter} onPress={() => navigation.navigate('ReportsTab', { screen: 'ReportsHome', params: {} })}>
          <Ionicons name="document-text" size={20} color="#9333EA" />
          <Text style={[styles.counterValue, counts.reports > 0 && { color: '#9333EA' }]}>{counts.reports}</Text>
          <Text style={styles.counterLabel}>Report da leggere</Text>
        </Pressable>
        <Pressable style={styles.counter} onPress={() => navigation.navigate('ChecksTab', { screen: 'ChecksHome', params: { fromHome: true } })}>
          <Ionicons name="camera" size={20} color="#0D9488" />
          <Text style={[styles.counterValue, counts.checks > 0 && { color: '#0D9488' }]}>{counts.checks}</Text>
          <Text style={styles.counterLabel}>Check da commentare</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Ionicons name="pulse" size={18} color={colors.primary} />
          <Text style={styles.panelTitle}>Coach Assistant</Text>
          {withAlerts.length > 0 && <Text style={styles.badge}>{withAlerts.length}</Text>}
        </View>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : withAlerts.length === 0 ? (
          <View style={styles.allGood}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.allGoodText}>Nessun atleta richiede attenzione: inattività, aderenza e carico sono nella norma.</Text>
          </View>
        ) : (
          <>
            {shownAlerts.map((athlete) => (
              <Pressable key={athlete.utenteid} style={({ pressed }) => [styles.alertRow, pressed && { opacity: 0.8 }]} onPress={() => openAthlete(athlete.utenteid)}>
                <View style={styles.alertHead}>
                  <Text style={styles.alertName} numberOfLines={1}>{athlete.nome}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
                <View style={styles.chips}>
                  {athlete.alerts.map((alert) => (
                    <Text key={alert.type} style={[styles.chip, { color: PRIORITY_COLORS[alert.priority], borderColor: PRIORITY_COLORS[alert.priority] }]}>{alert.message}</Text>
                  ))}
                </View>
              </Pressable>
            ))}
            {withAlerts.length > 4 && (
              <Pressable onPress={() => setShowAll((value) => !value)}>
                <Text style={styles.link}>{showAll ? 'Mostra meno' : `Mostra tutti (${withAlerts.length})`}</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>I tuoi atleti</Text>
        <Pressable onPress={() => navigation.navigate('ClientsTab')} hitSlop={6}>
          <Text style={styles.link}>+ Aggiungi</Text>
        </Pressable>
      </View>
      {clients.length > 6 && <TextInput value={query} onChangeText={setQuery} placeholder="Cerca atleta" style={styles.search} />}
      {loadingClients && !clients.length ? <ActivityIndicator color={colors.primary} /> : null}
      {!loadingClients && !clients.length && <Text style={styles.empty}>Nessun atleta collegato. Aggiungili dalla sezione Atleti.</Text>}
      <View style={styles.list}>
        {filtered.map((client, index) => (
          <Pressable key={client.utenteid} style={({ pressed }) => [styles.athleteRow, index > 0 && styles.rowDivider, pressed && { backgroundColor: colors.surfaceAlt }]} onPress={() => openAthlete(client.utenteid)}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials(fullName(client))}</Text></View>
            <Text style={styles.athleteName} numberOfLines={1}>{fullName(client)}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, maxWidth: 820, width: '100%', alignSelf: 'center' },
  hello: { ...typography.h1 },
  counters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  counter: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, alignItems: 'flex-start', gap: 2 },
  counterValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  counterLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  panel: { marginTop: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  panelTitle: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
  badge: { backgroundColor: '#FEE2E2', color: colors.danger, fontWeight: '800', fontSize: 12, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  allGood: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  allGoodText: { flex: 1, ...typography.caption },
  alertRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  alertHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alertName: { fontSize: 15, fontWeight: '800', color: colors.text, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  link: { color: colors.primary, fontWeight: '700', marginTop: spacing.xs },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.sm },
  list: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  athleteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '800' },
  athleteName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.md },
});
