import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, ActivityIndicator, Switch } from 'react-native';
import api from '../api/client';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';
import { performanceStatus } from '../utils/endurance';

const PRIORITY_COLORS = { alta: '#dc2626', media: '#d97706', bassa: '#64748b' };

export default function ClientsScreen({ navigation }) {
  const { clients, loadingClients, loadClients, selectedAthlete, setSelectedAthlete } = useAthlete();
  const [enduranceById, setEnduranceById] = useState({});
  const [savingEndurance, setSavingEndurance] = useState(null);

  // Il coach decide per ogni atleta se mostrargli le sezioni endurance
  const toggleAthleteEndurance = async (athlete, visible) => {
    setSavingEndurance(athlete.utenteid);
    setEnduranceById((current) => ({ ...current, [athlete.utenteid]: visible }));
    try {
      await api.put(`/users/clients/${athlete.utenteid}/endurance`, { visible });
      loadClients();
    } catch (e) {
      setEnduranceById((current) => ({ ...current, [athlete.utenteid]: !visible }));
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile aggiornare la sezione endurance');
    } finally {
      setSavingEndurance(null);
    }
  };
  const athleteEndurance = (athlete) => (athlete.utenteid in enduranceById ? enduranceById[athlete.utenteid] : athlete.endurance_visible !== false);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [statusById, setStatusById] = useState({});

  // Stato atleti dal Coach Assistant (carico, aderenza, alert)
  useFocusEffect(useCallback(() => {
    api.get('/pt/alerts')
      .then(({ data }) => setStatusById(Object.fromEntries((data?.athletes || []).map((athlete) => [athlete.utenteid, athlete]))))
      .catch(() => setStatusById({}));
  }, []));

  const addClient = async () => {
    if (!email) return;
    setAdding(true);
    try {
      await api.post('/users/clients', { email: email.trim() });
      setEmail('');
      await loadClients();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile collegare l\u2019atleta');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.addRow}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email atleta esistente"
          autoCapitalize="none"
          style={styles.input}
        />
        <Pressable style={styles.addBtn} onPress={addClient} disabled={adding}>
          {adding ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.addBtnText}>Aggiungi</Text>}
        </Pressable>
      </View>

      {loadingClients ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(item) => String(item.utenteid)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<Text style={styles.empty}>Nessun atleta collegato ancora.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.card, selectedAthlete?.utenteid === item.utenteid && styles.cardActive]}>
            <Pressable
              onPress={() => { setSelectedAthlete(item); if (navigation.canGoBack()) navigation.goBack(); }}
            >
              <Text style={typography.h3}>{item.nome}</Text>
              {!!statusById[item.utenteid] && (
                <View style={styles.statusRow}>
                  {athleteEndurance(item) && (
                    <Text style={[styles.statusChip, { color: performanceStatus(statusById[item.utenteid].performance).color }]}>
                      Performance {statusById[item.utenteid].performance > 0 ? '+' : ''}{Math.round(statusById[item.utenteid].performance)}
                    </Text>
                  )}
                  {statusById[item.utenteid].aderenza_pct !== null && (
                    <Text style={styles.statusChip}>Aderenza 7gg {statusById[item.utenteid].aderenza_pct}%</Text>
                  )}
                  {statusById[item.utenteid].alerts.map((alert) => (
                    <Text key={alert.type} style={[styles.statusChip, { color: PRIORITY_COLORS[alert.priority], borderColor: PRIORITY_COLORS[alert.priority] }]}>{alert.message}</Text>
                  ))}
                </View>
              )}
              {!!item.cognome && <Text style={styles.detail}>Cognome: {item.cognome}</Text>}
              <Text style={typography.caption}>{item.email}</Text>
              {!!item.datanascita && <Text style={styles.detail}>Data di nascita: {String(item.datanascita).slice(0, 10)}</Text>}
              {!!item.sesso && <Text style={styles.detail}>Sesso: {item.sesso}</Text>}
              {(item.pesokg || item.altezzacm) && <Text style={styles.detail}>Peso: {item.pesokg || '—'} kg · Altezza: {item.altezzacm || '—'} cm</Text>}
              {!!item.obiettivoallenamento && <Text style={styles.detail}>Obiettivo: {item.obiettivoallenamento}</Text>}
              {!!item.durata_allenamento_minuti && <Text style={styles.detail}>Durata: {item.durata_allenamento_minuti} min</Text>}
              {!!item.giorni_allenamento && <Text style={styles.detail}>Giorni: {item.giorni_allenamento}</Text>}
              {!!item.livellofitness && <Text style={styles.detail}>Livello: {item.livellofitness}</Text>}
            </Pressable>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Sezione endurance</Text>
                <Text style={styles.switchHint}>{athleteEndurance(item) ? 'Visibile all\'atleta' : 'Nascosta all\'atleta'}</Text>
              </View>
              {savingEndurance === item.utenteid ? <ActivityIndicator color={colors.primary} /> : (
                <Switch value={athleteEndurance(item)} onValueChange={(value) => toggleAthleteEndurance(item, value)} trackColor={{ true: colors.primary }} />
              )}
            </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  addRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceAlt },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: colors.textInverse, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  detail: { ...typography.caption, marginTop: spacing.xs },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs, marginBottom: spacing.xs },
  statusChip: { fontSize: 10, fontWeight: '700', color: colors.textMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  switchLabel: { fontSize: 13, fontWeight: '800', color: colors.text },
  switchHint: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
});
