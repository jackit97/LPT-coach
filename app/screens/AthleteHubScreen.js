import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAthlete } from '../context/AthleteContext';
import { performanceStatus } from '../utils/endurance';
import { fullName, initials } from './CoachHomeScreen';
import { colors, spacing, radius, typography } from '../theme';

const PRIORITY_COLORS = { alta: '#dc2626', media: '#d97706', bassa: '#64748b' };

// Pagina dell'atleta per il coach: riepilogo (carico, aderenza, alert) e riquadri verso tutte le sezioni.
export default function AthleteHubScreen({ route, navigation }) {
  const athleteId = Number(route.params?.athleteId);
  const { clients, setSelectedAthlete } = useAthlete();
  const athlete = clients.find((client) => client.utenteid === athleteId);
  const [status, setStatus] = useState(null);
  const [counts, setCounts] = useState({ reports: 0, checks: 0, payments: 0 });
  const [loading, setLoading] = useState(true);

  React.useLayoutEffect(() => {
    if (athlete) navigation.setOptions({ title: fullName(athlete) });
  }, [navigation, athlete]);

  useFocusEffect(useCallback(() => {
    if (athlete) setSelectedAthlete(athlete);
    let active = true;
    Promise.all([
      api.get('/pt/alerts').then((r) => (r.data?.athletes || []).find((row) => row.utenteid === athleteId) || null).catch(() => null),
      api.get('/reports', { params: { utenteId: athleteId } }).then((r) => (r.data || []).filter((row) => !row.letto_at).length).catch(() => 0),
      api.get('/checks/inbox').then((r) => (r.data || []).filter((row) => row.athlete_id === athleteId).length).catch(() => 0),
      api.get('/payments', { params: { utenteId: athleteId } }).then((r) => (r.data || []).filter((row) => row.stato !== 'Pagato').length).catch(() => 0),
    ]).then(([row, reports, checks, payments]) => {
      if (!active) return;
      setStatus(row);
      setCounts({ reports, checks, payments });
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, athlete?.utenteid]));

  if (!athlete) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={[typography.caption, { marginTop: spacing.sm }]}>Caricamento atleta…</Text></View>;
  }

  const endurance = athlete.endurance_visible !== false;
  const diet = athlete.dieta_visible !== false;
  const open = (tab, screen, params = {}) => {
    setSelectedAthlete(athlete);
    navigation.navigate(tab, { screen, params: { ...params, fromHub: true }, initial: false });
  };
  const tiles = [
    { key: 'cal', label: 'Calendario', hint: 'Allenamenti e feedback', icon: 'calendar', color: '#2563EB', onPress: () => open('CalendarTab', 'Calendar') },
    { key: 'pesi', label: 'Pesistica', hint: 'Schede palestra', icon: 'barbell', color: '#1D4ED8', onPress: () => open('StrengthTab', 'StrengthHome') },
    endurance && { key: 'piani', label: 'Piani endurance', hint: 'Periodizzazione', icon: 'bicycle', color: '#16A34A', onPress: () => open('EnduranceTab', 'EnduranceHome') },
    endurance && { key: 'zone', label: 'Zone e test', hint: 'FC, passo, potenza', icon: 'speedometer', color: '#F59E0B', onPress: () => open('ZonesTab', 'ZonesHome') },
    diet && { key: 'diete', label: 'Diete', hint: 'Piani alimentari', icon: 'restaurant', color: '#DB2777', onPress: () => open('DietsTab', 'Diets') },
    { key: 'check', label: 'Check', hint: 'Foto dei progressi', icon: 'camera', color: '#0D9488', badge: counts.checks, onPress: () => open('ChecksTab', 'ChecksHome') },
    { key: 'pay', label: 'Pagamenti', hint: 'Scadenze e incassi', icon: 'card', color: '#EA580C', badge: counts.payments, onPress: () => open('PaymentsTab', 'PaymentsHome') },
    { key: 'report', label: 'Report', hint: 'Video e dubbi', icon: 'document-text', color: '#9333EA', badge: counts.reports, onPress: () => navigation.navigate('ReportsTab', { screen: 'ReportsHome', params: { utenteId: athleteId, athleteName: fullName(athlete) } }) },
    { key: 'tips', label: 'Consigli', hint: 'Messaggi nella sua Home', icon: 'bulb', color: '#F59E0B', onPress: () => navigation.navigate('CoachTips', { athleteId, athleteName: fullName(athlete) }) },
    { key: 'lib', label: 'Assegna dalla libreria', hint: 'Allenamenti e piani pronti', icon: 'library', color: '#4F46E5', onPress: () => navigation.navigate('LibraryTab', { screen: 'LibraryHome', params: { athleteId, athleteName: fullName(athlete) } }) },
  ].filter(Boolean);
  const perf = status ? performanceStatus(status.performance) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(fullName(athlete))}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{fullName(athlete)}</Text>
          <Text style={typography.caption} numberOfLines={1}>{athlete.email}</Text>
        </View>
      </View>

      <View style={styles.statusCard}>
        {loading ? <ActivityIndicator color={colors.primary} /> : (
          <>
            <View style={styles.stats}>
              {endurance && (
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Performance</Text>
                  <Text style={[styles.statValue, { color: perf?.color }]}>{status ? `${status.performance > 0 ? '+' : ''}${Math.round(status.performance)}` : '—'}</Text>
                  <Text style={styles.statHint} numberOfLines={1}>{perf?.label || '—'}</Text>
                </View>
              )}
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Aderenza 7 gg</Text>
                <Text style={styles.statValue}>{status?.aderenza_pct !== null && status?.aderenza_pct !== undefined ? `${status.aderenza_pct}%` : '—'}</Text>
                <Text style={styles.statHint}>tempo fatto / pianificato</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Ultimo allenamento</Text>
                <Text style={styles.statValue}>{status?.giorni_inattivita === null || status?.giorni_inattivita === undefined ? '—' : status.giorni_inattivita === 0 ? 'oggi' : `${status.giorni_inattivita} gg fa`}</Text>
                <Text style={styles.statHint}>allenamento svolto</Text>
              </View>
            </View>
            {status?.alerts?.length > 0 ? (
              <View style={styles.chips}>
                {status.alerts.map((alert) => (
                  <Text key={alert.type} style={[styles.chip, { color: PRIORITY_COLORS[alert.priority], borderColor: PRIORITY_COLORS[alert.priority] }]}>⚠ {alert.message}</Text>
                ))}
              </View>
            ) : (
              <Text style={styles.ok}>✓ Nessun avviso dal Coach Assistant</Text>
            )}
          </>
        )}
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable key={tile.key} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]} onPress={tile.onPress}>
            <View style={[styles.tileIcon, { backgroundColor: `${tile.color}18` }]}>
              <Ionicons name={tile.icon} size={22} color={tile.color} />
            </View>
            <Text style={styles.tileLabel} numberOfLines={1}>{tile.label}</Text>
            <Text style={styles.tileHint} numberOfLines={1}>{tile.hint}</Text>
            {tile.badge > 0 && <Text style={[styles.tileBadge, { backgroundColor: tile.color }]}>{tile.badge}</Text>}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, maxWidth: 820, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  name: { ...typography.h1 },
  statusCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm },
  statLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  statHint: { fontSize: 10, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  ok: { marginTop: spacing.sm, color: colors.success, fontWeight: '700', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  tile: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 104 },
  tileIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  tileLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  tileHint: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  tileBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm, color: '#fff', fontWeight: '800', fontSize: 11, minWidth: 20, textAlign: 'center', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
});
