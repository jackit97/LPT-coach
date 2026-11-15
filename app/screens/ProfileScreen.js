import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Switch, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import DateField from '../components/DateField';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function ProfileScreen() {
  const { user, logout, isCoach, enduranceEnabled, setEnduranceEnabled, profileComplete, refreshAccountStatus } = useAuth();
  const isAthlete = user?.ruolo === 'cliente';
  const [profile, setProfile] = useState(user || {});
  const [saving, setSaving] = useState(false);
  const [togglingEndurance, setTogglingEndurance] = useState(false);
  const [syncingStrava, setSyncingStrava] = useState(false);
  const [stravaStatus, setStravaStatus] = useState(null);
  const [stravaConfig, setStravaConfig] = useState({
    connected: false,
    clientId: '',
    clientSecret: '',
    redirectUri: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin + '/' : 'https://lpt-coach.pages.dev/',
    syncMode: 'auto',
  });
  const [stats, setStats] = useState({ sessions: 18, distanceKm: 246.4, trimp: 132, avgRpe: 7.3 });

  useEffect(() => { api.get('/users/me').then(({ data }) => setProfile(data)).catch(() => {}); }, []);

  const loadStravaStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/strava/status');
      setStravaStatus(data);
      if (data?.connected) {
        setStravaConfig((curr) => ({
          ...curr,
          connected: true,
          clientId: data.clientId || curr.clientId,
          redirectUri: data.redirectUri || curr.redirectUri,
          syncMode: data.sync_mode || curr.syncMode,
        }));
      }
    } catch (e) {
      // not connected or offline
    }
  }, []);

  useEffect(() => {
    const loadSavedStravaConfig = async () => {
      try {
        const raw = await AsyncStorage.getItem('strava-config');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        setStravaConfig((current) => ({
          ...current,
          ...parsed,
          redirectUri: parsed.redirectUri || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin + '/' : 'https://lpt-coach.pages.dev/'),
        }));
      } catch (error) {
        // ignore invalid saved config
      }
    };

    loadSavedStravaConfig();
    loadStravaStatus();
  }, [loadStravaStatus]);

  // Handle OAuth code on web redirect (e.g. ?code=xxx)
  useEffect(() => {
    const handleAuthRedirect = async () => {
      let code = null;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        code = params.get('code');
      }

      if (!code) return;

      setSyncingStrava(true);
      try {
        const raw = await AsyncStorage.getItem('strava-config');
        const saved = raw ? JSON.parse(raw) : {};
        const clientId = saved.clientId || stravaConfig.clientId;
        const clientSecret = saved.clientSecret || stravaConfig.clientSecret;
        const redirectUri = saved.redirectUri || stravaConfig.redirectUri;

        const { data } = await api.post('/strava/connect', {
          code,
          clientId,
          clientSecret,
          redirectUri,
          syncMode: saved.syncMode || stravaConfig.syncMode || 'auto',
        });

        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history?.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        setStravaStatus({
          connected: true,
          athlete: data.athlete,
          last_sync: new Date().toISOString(),
          importedCount: data.importedCount,
        });
        setStravaConfig((curr) => ({ ...curr, connected: true }));

        Alert.alert(
          'Strava collegato!',
          `Account ${data.athlete?.firstname || ''} ${data.athlete?.lastname || ''} collegato con successo! Importate ${data.importedCount || 0} attività nel calendario.`
        );
      } catch (err) {
        Alert.alert('Errore collegamento Strava', err?.response?.data?.message || 'Scambio del codice Strava non riuscito.');
      } finally {
        setSyncingStrava(false);
      }
    };

    handleAuthRedirect();
  }, [stravaConfig.clientId, stravaConfig.clientSecret, stravaConfig.redirectUri, stravaConfig.syncMode]);
  const [days, setDays] = useState([]);
  const toggleDay = (day) => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  useEffect(() => { setDays((profile.giorni_allenamento || '').split(',').map((day) => day.trim()).filter(Boolean)); }, [profile.giorni_allenamento]);
  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    try { await api.put('/users/me/profile', { nome: profile.nome, cognome: profile.cognome, pesokg: profile.pesokg, altezzacm: profile.altezzacm, obiettivoallenamento: profile.obiettivoallenamento, durataAllenamentoMinuti: profile.durata_allenamento_minuti, giorniAllenamento: days.join(', '), livellofitness: profile.livellofitness, datanascita: profile.datanascita || null, sesso: profile.sesso || null }); await refreshAccountStatus(); Alert.alert('Profilo salvato', 'I dati sono visibili al coach.'); }
    catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare il profilo'); }
    finally { setSaving(false); }
  };

  const toggleEndurance = async (value) => {
    setTogglingEndurance(true);
    try { await api.put('/users/me/endurance-settings', { enabled: value }); setEnduranceEnabled(value); }
    catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile aggiornare la sezione endurance'); }
    finally { setTogglingEndurance(false); }
  };

  const persistStravaConfig = async (nextConfig) => {
    try {
      await AsyncStorage.setItem('strava-config', JSON.stringify(nextConfig));
    } catch (error) {
      // ignore storage failure and keep in-memory state only
    }
  };

  const connectStrava = async () => {
    if (!stravaConfig.clientId || !stravaConfig.redirectUri) {
      Alert.alert('Strava', 'Inserisci prima il Client ID e l\'URL di redirect per avviare il collegamento.');
      return;
    }

    await persistStravaConfig(stravaConfig);

    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(stravaConfig.clientId)}&redirect_uri=${encodeURIComponent(stravaConfig.redirectUri)}&response_type=code&approval_prompt=auto&scope=${encodeURIComponent('read,activity:read_all,profile:read_all')}`;

    try {
      const canOpen = await Linking.canOpenURL(authUrl);
      if (!canOpen) {
        Alert.alert('Strava', 'Impossibile aprire Strava in questo dispositivo. Copia il link manualmente.');
        return;
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(authUrl, '_blank', 'noopener,noreferrer');
      } else {
        await Linking.openURL(authUrl);
      }

      Alert.alert('Strava', 'Ti stiamo portando alla pagina di autorizzazione Strava. Completa l\'accesso per autorizzare LPT Coach.');
    } catch (error) {
      Alert.alert('Errore', 'Non è stato possibile aprire la pagina Strava.');
    }
  };

  const syncStravaNow = async () => {
    setSyncingStrava(true);
    try {
      const { data } = await api.post('/strava/sync');
      Alert.alert('Strava', data.message || 'Attività sincronizzate con successo!');
      await loadStravaStatus();
    } catch (err) {
      Alert.alert('Errore sincronizzazione', err?.response?.data?.message || 'Impossibile sincronizzare le attività Strava.');
    } finally {
      setSyncingStrava(false);
    }
  };

  const disconnectStrava = async () => {
    Alert.alert('Scollega Strava', 'Vuoi disconnettere il tuo account Strava da LPT Coach?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Scollega',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post('/strava/disconnect');
            setStravaStatus({ connected: false });
            setStravaConfig((curr) => ({ ...curr, connected: false }));
            await persistStravaConfig({ ...stravaConfig, connected: false });
            Alert.alert('Strava', 'Account Strava scollegato');
          } catch (err) {
            Alert.alert('Errore', err?.response?.data?.message || 'Impossibile scollegare Strava');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{user?.nome?.[0]?.toUpperCase() || '?'}</Text></View>
      <Text style={typography.h2}>{user?.nome}</Text>
      <Text style={typography.caption}>{user?.email}</Text>
      <Text style={styles.role}>{user?.ruolo === 'personal_trainer' ? 'Coach' : 'Atleta'}</Text>

      {!isCoach && (
        <View style={styles.statsPanel}>
          <Text style={styles.statsTitle}>Riepilogo ultimi 30 giorni</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Sessioni</Text>
              <Text style={styles.statValue}>{stats.sessions}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Distanza</Text>
              <Text style={styles.statValue}>{stats.distanceKm.toFixed(1)} km</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Trimp</Text>
              <Text style={styles.statValue}>{stats.trimp}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>RPE medio</Text>
              <Text style={styles.statValue}>{stats.avgRpe.toFixed(1)}</Text>
            </View>
          </View>
        </View>
      )}

      {!isCoach && (
        <View style={styles.stravaPanel}>
          <View style={styles.stravaHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>⚡</Text>
                <Text style={styles.sectionTitle}>Integrazione Strava</Text>
              </View>
              {stravaStatus?.connected ? (
                <Text style={styles.stravaStatusConnected}>
                  Connesso: {stravaStatus.athlete ? `${stravaStatus.athlete.firstname || ''} ${stravaStatus.athlete.lastname || ''}`.trim() : 'Account attivo'}
                </Text>
              ) : (
                <Text style={styles.stravaStatus}>Non connesso</Text>
              )}
            </View>
          </View>

          {stravaStatus?.connected ? (
            <View style={styles.stravaConnectedBox}>
              <Text style={styles.stravaSyncInfo}>
                Ultima sincronizzazione: {stravaStatus.last_sync ? new Date(stravaStatus.last_sync).toLocaleString('it-IT') : 'Mai'}
              </Text>
              <View style={styles.stravaActionRow}>
                <Pressable
                  style={[styles.stravaSyncBtn, syncingStrava && { opacity: 0.6 }]}
                  onPress={syncStravaNow}
                  disabled={syncingStrava}
                >
                  {syncingStrava ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.stravaSyncBtnText}>🔄 Sincronizza attività ora</Text>
                  )}
                </Pressable>
                <Pressable style={styles.stravaDisconnectBtn} onPress={disconnectStrava}>
                  <Text style={styles.stravaDisconnectText}>Scollega</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.stravaConnectBox}>
              <Text style={styles.stravaHintText}>
                Collega il tuo account Strava per importare automaticamente gli allenamenti, tempi, distanza e frequenza cardiaca nel calendario.
              </Text>
              <Pressable style={styles.stravaMainButton} onPress={connectStrava}>
                <Text style={styles.stravaMainButtonText}>⚡ Accedi e autorizza con Strava</Text>
              </Pressable>
            </View>
          )}

          <Text style={[styles.sectionSubtitle, { marginTop: spacing.md }]}>Credenziali API Strava</Text>
          <Text style={styles.stravaCredHint}>
            Inserisci il Client ID e Secret della tua applicazione Strava (da strava.com/settings/api). Come Authorization Callback Domain imposta il dominio di questa app.
          </Text>

          <Text style={styles.label}>Client ID</Text>
          <TextInput
            value={stravaConfig.clientId}
            onChangeText={(value) => {
              const next = { ...stravaConfig, clientId: value };
              setStravaConfig(next);
              persistStravaConfig(next);
            }}
            style={styles.input}
            placeholder="es. 123456"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Client Secret</Text>
          <TextInput
            value={stravaConfig.clientSecret}
            onChangeText={(value) => {
              const next = { ...stravaConfig, clientSecret: value };
              setStravaConfig(next);
              persistStravaConfig(next);
            }}
            style={styles.input}
            placeholder="Inserisci secret Strava"
            secureTextEntry
          />

          <Text style={styles.label}>Redirect URI</Text>
          <TextInput
            value={stravaConfig.redirectUri}
            onChangeText={(value) => {
              const next = { ...stravaConfig, redirectUri: value };
              setStravaConfig(next);
              persistStravaConfig(next);
            }}
            style={styles.input}
            placeholder="https://..."
          />

          <Text style={styles.label}>Modalità import</Text>
          <View style={styles.syncRow}>
            {['auto', 'manual'].map((mode) => (
              <Pressable
                key={mode}
                onPress={() => {
                  const next = { ...stravaConfig, syncMode: mode };
                  setStravaConfig(next);
                  persistStravaConfig(next);
                }}
                style={[styles.syncChip, stravaConfig.syncMode === mode && styles.syncChipActive]}
              >
                <Text style={[styles.syncChipText, stravaConfig.syncMode === mode && styles.syncChipTextActive]}>
                  {mode === 'auto' ? 'Automatica (consigliata)' : 'Manuale'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {isCoach && (
        <View style={styles.enduranceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Modulo Endurance</Text>
            <Text style={typography.caption}>Disattivalo per nascondere le sezioni e i campi endurance a te e ai tuoi atleti.</Text>
          </View>
          {togglingEndurance ? <ActivityIndicator color={colors.primary} /> : (
            <Switch value={enduranceEnabled} onValueChange={toggleEndurance} trackColor={{ true: colors.primary }} />
          )}
        </View>
      )}

      {isAthlete && !profileComplete && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>Completa il profilo qui sotto: una volta salvato verrai aggiunto automaticamente tra gli atleti del coach.</Text>
        </View>
      )}

      {isAthlete && <View style={styles.form}>
        <Text style={styles.sectionTitle}>Dati allenamento</Text>
        <Text style={styles.label}>Nome</Text><TextInput value={profile.nome || ''} onChangeText={(value) => update('nome', value)} style={styles.input} />
        <Text style={styles.label}>Cognome</Text><TextInput value={profile.cognome || ''} onChangeText={(value) => update('cognome', value)} style={styles.input} />
        <Text style={styles.label}>Data di nascita</Text><DateField value={profile.datanascita ? String(profile.datanascita).slice(0, 10) : ''} onChange={(value) => update('datanascita', value)} style={styles.dateField} />
        <Text style={styles.label}>Sesso</Text><View style={styles.sexRow}>{['Femmina', 'Maschio', 'Altro', 'Preferisco non indicarlo'].map((sex) => <Pressable key={sex} onPress={() => update('sesso', sex)} style={[styles.sexChip, profile.sesso === sex && styles.sexChipActive]}><Text style={[styles.sexText, profile.sesso === sex && styles.sexTextActive]}>{sex}</Text></Pressable>)}</View>
        <View style={styles.row}><View style={styles.half}><Text style={styles.label}>Peso (kg)</Text><TextInput value={String(profile.pesokg || '')} onChangeText={(value) => update('pesokg', value)} keyboardType="decimal-pad" style={styles.input} /></View><View style={styles.half}><Text style={styles.label}>Altezza (cm)</Text><TextInput value={String(profile.altezzacm || '')} onChangeText={(value) => update('altezzacm', value)} keyboardType="numeric" style={styles.input} /></View></View>
        <Text style={styles.label}>Obiettivo allenamento</Text><TextInput value={profile.obiettivoallenamento || ''} onChangeText={(value) => update('obiettivoallenamento', value)} style={[styles.input, styles.area]} multiline placeholder="Forza, dimagrimento, HYROX..." />
        <Text style={styles.label}>Durata desiderata (minuti)</Text><TextInput value={String(profile.durata_allenamento_minuti || '')} onChangeText={(value) => update('durata_allenamento_minuti', value)} keyboardType="numeric" style={styles.input} placeholder="60" />
        <Text style={styles.label}>Giorni di allenamento</Text><View style={styles.days}>{['Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato', 'Domenica'].map((day) => <Pressable key={day} onPress={() => toggleDay(day)} style={[styles.day, days.includes(day) && styles.dayActive]}><Text style={[styles.dayText, days.includes(day) && styles.dayTextActive]}>{day.slice(0, 3)}</Text></Pressable>)}</View>
        <Text style={styles.label}>Livello di forma fisica attuale</Text><TextInput value={profile.livellofitness || ''} onChangeText={(value) => update('livellofitness', value)} style={styles.input} placeholder="Principiante, intermedio, avanzato" />
        <Pressable style={styles.saveButton} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salva dati profilo</Text>}</Pressable>
      </View>}

      <Pressable style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Esci</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, content: { alignItems: 'center', padding: spacing.xl },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  avatarText: { color: colors.textInverse, fontSize: 32, fontWeight: '700' },
  role: { ...typography.caption, marginTop: spacing.sm, backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  enduranceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', maxWidth: 620, marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  statsPanel: { width: '100%', maxWidth: 620, marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  statsTitle: { ...typography.h3, marginBottom: spacing.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: radius.md, padding: spacing.sm },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  statValue: { marginTop: 4, fontSize: 18, fontWeight: '800', color: colors.text },
  stravaPanel: { width: '100%', maxWidth: 620, marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  stravaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  stravaStatus: { marginTop: 4, fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  stravaStatusConnected: { marginTop: 4, fontSize: 12, color: '#10b981', fontWeight: '700' },
  stravaConnectedBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: radius.md, padding: spacing.sm, marginVertical: spacing.xs },
  stravaSyncInfo: { fontSize: 11, color: '#15803d', marginBottom: spacing.xs, fontWeight: '500' },
  stravaActionRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  stravaSyncBtn: { backgroundColor: '#FC4C02', borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  stravaSyncBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  stravaDisconnectBtn: { backgroundColor: '#fee2e2', borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  stravaDisconnectText: { color: '#dc2626', fontWeight: '600', fontSize: 12 },
  stravaConnectBox: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#ffedd5', borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.xs },
  stravaHintText: { fontSize: 12, color: '#9a3412', marginBottom: spacing.sm, lineHeight: 16 },
  stravaMainButton: { backgroundColor: '#FC4C02', borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  stravaMainButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  sectionSubtitle: { fontSize: 12, fontWeight: '700', color: colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  stravaCredHint: { fontSize: 11, color: colors.textMuted, marginTop: 2, marginBottom: spacing.xs },
  stravaButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  stravaButtonConnected: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#10b981' },
  stravaButtonText: { color: colors.textInverse, fontWeight: '700', fontSize: 12 },
  syncRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  syncChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  syncChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  syncChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  syncChipTextActive: { color: colors.primary, fontWeight: '700' },
  warningBox: { width: '100%', maxWidth: 620, marginTop: spacing.xl, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', borderRadius: radius.md, padding: spacing.md },
  warningText: { color: '#92400E', fontWeight: '600' },
  logoutBtn: { marginTop: spacing.xxl, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  logoutText: { color: colors.danger, fontWeight: '700' },
  form: { width: '100%', maxWidth: 620, marginTop: spacing.xl }, sectionTitle: { ...typography.h3, marginBottom: spacing.sm }, label: { ...typography.caption, marginTop: spacing.sm, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs }, area: { minHeight: 60, textAlignVertical: 'top' }, row: { flexDirection: 'row', gap: spacing.sm }, half: { flex: 1 }, sexRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }, sexChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface }, sexChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, sexText: { color: colors.textMuted, fontSize: 14 }, sexTextActive: { color: colors.primary, fontWeight: '700' }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, day: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface }, dayActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, dayText: { color: colors.textMuted }, dayTextActive: { color: colors.primary, fontWeight: '700' }, saveButton: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg }, saveText: { color: '#fff', fontWeight: '700' },
});
