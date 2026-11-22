import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../api/client';
import { colors, spacing, radius } from '../../theme';

// Profilo developer: chi e' online, utilizzo dell'app, riepilogo errori e segnalazioni
const ROLE = { cliente: 'Atleta', personal_trainer: 'Coach', developer: 'Developer' };
export const fmtAgo = (value) => {
  if (!value) return 'mai';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 90) return 'ora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h fa`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)} g fa`;
  return new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
};
const fmtMinutes = (minutes) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes || 0}m`);
const fullName = (u) => [u.nome, u.cognome].filter(Boolean).join(' ') || `Utente ${u.utenteid}`;

function Kpi({ label, value, color = colors.text, onPress, hint }) {
  const Box = onPress ? Pressable : View;
  return (
    <Box style={styles.kpi} onPress={onPress}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      {!!hint && <Text style={styles.kpiHint}>{hint}</Text>}
    </Box>
  );
}

export default function DevDashboardScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const { data: result } = await api.get('/dev/overview');
      setData(result);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.message || 'Impossibile caricare i dati');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load]);

  if (!data && !error) return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />;
  const days = data?.giorni || [];
  const maxMinutes = Math.max(...days.map((d) => d.minuti || 0), 1);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {data && (
        <>
          <View style={styles.kpis}>
            <Kpi label="Online ora" value={data.online.length} color={colors.success} />
            <Kpi label="Attivi oggi" value={data.oggi?.utenti || 0} />
            <Kpi label="Minuti oggi" value={fmtMinutes(data.oggi?.minuti || 0)} />
            <Kpi label="Errori aperti" value={data.errori?.aperti || 0} color={data.errori?.aperti ? colors.danger : colors.text} onPress={() => navigation.navigate('DevErrorsTab')} />
            <Kpi label="Segnalazioni nuove" value={data.feedback?.nuovi || 0} color={data.feedback?.nuovi ? '#D97706' : colors.text} onPress={() => navigation.navigate('DevFeedbackTab')} />
            <Kpi label="Utenti" value={data.ruoli.reduce((sum, r) => sum + r.totale, 0)} hint={data.ruoli.map((r) => `${r.totale} ${ROLE[r.ruolo] || r.ruolo}`).join(' · ')} />
          </View>

          <Text style={styles.section}>Online ora ({data.online.length})</Text>
          {data.online.length === 0 ? <Text style={styles.empty}>Nessuno connesso negli ultimi 5 minuti.</Text> : (
            <View style={styles.card}>
              {data.online.map((u) => (
                <View key={u.utenteid} style={styles.onlineRow}>
                  <View style={styles.dot} />
                  <Text style={styles.name}>{fullName(u)}</Text>
                  <Text style={styles.role}>{ROLE[u.ruolo] || u.ruolo}</Text>
                  <Text style={styles.ago}>{fmtAgo(u.ultimo_accesso_at)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.section}>Ultimi 14 giorni</Text>
          <View style={styles.card}>
            {days.length === 0 ? <Text style={styles.empty}>Ancora nessun dato di utilizzo.</Text> : (
              <View style={styles.chart}>
                {days.map((d) => (
                  <View key={d.giorno} style={styles.chartCol}>
                    <Text style={styles.chartValue}>{d.utenti}</Text>
                    <View style={styles.chartTrack}><View style={[styles.chartBar, { height: `${Math.max(4, (d.minuti / maxMinutes) * 100)}%` }]} /></View>
                    <Text style={styles.chartLabel}>{d.giorno.slice(8, 10)}/{d.giorno.slice(5, 7)}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.legend}>Altezza barra = minuti di utilizzo totali · numero = utenti attivi</Text>
          </View>

          <Text style={styles.section}>Utilizzo per utente</Text>
          <View style={styles.card}>
            <View style={[styles.userRow, styles.userHead]}>
              <Text style={[styles.cell, { flex: 2 }]}>Utente</Text>
              <Text style={styles.cell}>7 gg</Text>
              <Text style={styles.cell}>30 gg</Text>
              <Text style={styles.cell}>Giorni</Text>
              <Text style={[styles.cell, { flex: 1.2 }]}>Ultimo accesso</Text>
            </View>
            {data.utenti.map((u) => (
              <View key={u.utenteid} style={styles.userRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.name} numberOfLines={1}>{fullName(u)}</Text>
                  <Text style={styles.role}>{ROLE[u.ruolo] || u.ruolo}</Text>
                </View>
                <Text style={styles.cell}>{fmtMinutes(u.minuti_7g)}</Text>
                <Text style={styles.cell}>{fmtMinutes(u.minuti_30g)}</Text>
                <Text style={styles.cell}>{u.giorni_30g}</Text>
                <Text style={[styles.cell, { flex: 1.2 }]}>{fmtAgo(u.ultimo_accesso_at)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 960, width: '100%', alignSelf: 'center' },
  error: { color: colors.danger, fontWeight: '700', marginBottom: spacing.md },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpi: { flexGrow: 1, flexBasis: '30%', minWidth: 140, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  kpiLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  kpiHint: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  section: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  role: { fontSize: 12, color: colors.textMuted },
  ago: { fontSize: 12, color: colors.textMuted, minWidth: 60, textAlign: 'right' },
  chart: { flexDirection: 'row', gap: 4, height: 140 },
  chartCol: { flex: 1, alignItems: 'center' },
  chartValue: { fontSize: 10, fontWeight: '700', color: colors.text },
  chartTrack: { flex: 1, width: '80%', justifyContent: 'flex-end', marginVertical: 2 },
  chartBar: { width: '100%', backgroundColor: colors.primary, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  chartLabel: { fontSize: 9, color: colors.textMuted },
  legend: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt, gap: 4 },
  userHead: { borderBottomColor: colors.border },
  cell: { flex: 1, fontSize: 12, color: colors.text, textAlign: 'right' },
});
