import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Switch, Linking, Platform, AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import DateField from '../components/DateField';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';
import { fullName, initials } from '../utils/names';
import { refreshGarminActivities, connectGarmin as connectGarminAccount } from '../utils/garmin';

export default function ProfileScreen({ navigation }) {
  const { user, logout, isCoach: coachRole, isDeveloper, enduranceEnabled, profileComplete, refreshAccountStatus, account, setAccount } = useAuth();
  // il developer non ha profilo atleta (statistiche, Strava, dati fisici): si comporta come il coach
  const isCoach = coachRole || isDeveloper;
  const [sendingVerify, setSendingVerify] = useState(false);
  const resendVerification = async () => {
    setSendingVerify(true);
    try {
      const { data } = await api.post('/users/me/verify-email');
      Alert.alert('Verifica email', data?.message || 'Email inviata');
      if (data?.verificata) refreshAccountStatus();
    } catch (e) {
      Alert.alert('Verifica email', e?.response?.data?.message || 'Invio non riuscito');
    } finally {
      setSendingVerify(false);
    }
  };
  const toggleEmailNotifications = async (enabled) => {
    setAccount((current) => ({ ...(current || {}), emailNotifications: enabled }));
    try { await api.put('/users/me/email-notifications', { enabled }); } catch { setAccount((current) => ({ ...(current || {}), emailNotifications: !enabled })); }
  };
  const isAthlete = user?.ruolo === 'cliente';
  const [profile, setProfile] = useState(user || {});
  const [saving, setSaving] = useState(false);
  const [syncingStrava, setSyncingStrava] = useState(false);
  const [stravaStatus, setStravaStatus] = useState(null);
  const [connectingStrava, setConnectingStrava] = useState(false);
  const [stats, setStats] = useState({ sessions: 0, distanceKm: 0, trimp: 0, avgRpe: null });

  // Riepilogo reale degli ultimi 30 giorni (prima i valori erano fissi)
  useFocusEffect(useCallback(() => {
    if (isCoach) return;
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 29);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    api.get('/calendar', { params: { from: iso(from), to: iso(to) } })
      .then(({ data }) => {
        const done = (data || []).filter((w) => w.load && w.load.secondi_eseguiti > 0);
        const rpes = done.map((w) => Number(w.feedback_rpe)).filter((v) => v > 0);
        setStats({
          sessions: done.length,
          distanceKm: done.reduce((sum, w) => sum + (w.load.metri_eseguiti || 0), 0) / 1000,
          trimp: done.reduce((sum, w) => sum + (w.load.trimp_eseguito || 0), 0),
          avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
        });
      })
      .catch(() => {});
  }, [isCoach]));

  useEffect(() => { api.get('/users/me').then(({ data }) => setProfile(data)).catch(() => {}); }, []);

  const [garminStatus, setGarminStatus] = useState(null);
  const [garminBusy, setGarminBusy] = useState(null); // 'connect' | 'sync' | null
  const loadStravaStatus = useCallback(async () => {
    if (isCoach) return;
    try {
      const { data } = await api.get('/strava/status');
      setStravaStatus(data);
    } catch (e) {
      // non collegato o offline
    }
    try {
      const { data } = await api.get('/garmin/status');
      setGarminStatus(data);
    } catch (e) {
      // non disponibile
    }
  }, [isCoach]);

  // Lo stato viene ricaricato quando si torna sulla schermata o nell'app (es. dopo l'autorizzazione su Strava)
  useFocusEffect(useCallback(() => { loadStravaStatus(); }, [loadStravaStatus]));
  useEffect(() => {
    if (isCoach) return undefined;
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') loadStravaStatus(); });
    const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') loadStravaStatus(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isCoach, loadStravaStatus]);

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

  // Un tocco: apre l'app Strava (se installata) o la pagina di accesso Strava. Dopo l'autorizzazione
  // Strava rimanda a /strava-callback, che completa il collegamento sul server e riporta in LPT Coach.
  const connectStrava = async () => {
    setConnectingStrava(true);
    try {
      const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
      const { data } = await api.post('/strava/authorize', {
        platform: isWeb ? 'web' : 'native',
        origin: isWeb ? window.location.origin : undefined,
      });
      if (isWeb) {
        window.location.href = data.url;
        return;
      }
      try {
        await Linking.openURL(data.appUrl);
      } catch {
        await Linking.openURL(data.url);
      }
    } catch (err) {
      Alert.alert('Strava', err?.response?.data?.message || 'Non è stato possibile avviare il collegamento con Strava.');
    } finally {
      setConnectingStrava(false);
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

  // Garmin Connect: si apre la pagina di Garmin, l'atleta accede e autorizza LPT Coach, poi torna nell'app.
  const connectGarmin = async () => {
    setGarminBusy('connect');
    try {
      const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
      const { data } = await api.post('/garmin/connect', { origin: isWeb ? window.location.origin : undefined });
      if (isWeb) {
        window.location.href = data.url;
        return;
      }
      await Linking.openURL(data.url);
    } catch (err) {
      Alert.alert('Garmin', err?.response?.data?.message || 'Non è stato possibile avviare il collegamento con Garmin.');
    } finally {
      setGarminBusy(null);
    }
  };

  const syncGarminNow = async () => {
    setGarminBusy('sync');
    try {
      const { data } = await api.post('/garmin/sync', {});
      Alert.alert('Garmin', data.message || 'Settimana inviata a Garmin');
    } catch (err) {
      Alert.alert('Garmin', err?.response?.data?.message || 'Invio a Garmin non riuscito');
    } finally {
      setGarminBusy(null);
      loadStravaStatus();
    }
  };

  // attivita' rinominate o descritte su Garmin Connect: Garmin le rimanda aggiornate
  const refreshGarmin = async () => {
    setGarminBusy('refresh');
    try { await refreshGarminActivities(); } finally { setGarminBusy(null); }
  };

  const disconnectGarmin = () => {
    Alert.alert('Scollega Garmin', 'Vuoi scollegare il tuo account Garmin? Gli allenamenti futuri inviati verranno tolti dal calendario Garmin.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Scollega',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post('/garmin/disconnect');
            setGarminStatus((current) => ({ configured: current?.configured, connected: false }));
            Alert.alert('Garmin', 'Account Garmin scollegato');
          } catch (err) {
            Alert.alert('Errore', err?.response?.data?.message || 'Impossibile scollegare Garmin');
          }
        },
      },
    ]);
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
            setStravaStatus({ connected: false, hasServerApp: stravaStatus?.hasServerApp });
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
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials(fullName(user, ''))}</Text></View>
      <Text style={typography.h2}>{fullName(user, '')}</Text>
      <Text style={typography.caption}>{user?.email}</Text>
      <Text style={styles.role}>{user?.ruolo === 'personal_trainer' ? 'Coach' : isDeveloper ? 'Developer' : 'Atleta'}</Text>

      {/* email: verifica e notifiche */}
      <View style={styles.emailCard}>
        <View style={styles.emailRow}>
          <Text style={styles.emailTitle}>Email</Text>
          <Text style={[styles.emailBadge, account?.emailVerified === false ? styles.badgeWarn : styles.badgeOk]}>
            {account?.emailVerified === false ? 'Da verificare' : '✓ Verificata'}
          </Text>
        </View>
        {account?.emailVerified === false ? (
          <>
            <Text style={styles.emailText}>Conferma {user?.email} con il link che ti abbiamo inviato per ricevere le notifiche anche via email.</Text>
            <Pressable style={styles.emailBtn} onPress={resendVerification} disabled={sendingVerify}>
              {sendingVerify ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.emailBtnText}>Invia di nuovo il link</Text>}
            </Pressable>
          </>
        ) : (
          <View style={styles.emailRow}>
            <Text style={[styles.emailText, { flex: 1 }]}>Ricevi le notifiche anche via email{account?.emailEnabled === false ? ' (invio email non ancora attivo)' : ''}</Text>
            <Switch value={account?.emailNotifications !== false} onValueChange={toggleEmailNotifications} trackColor={{ true: colors.primary }} />
          </View>
        )}
      </View>
      <View style={styles.linksRow}>
        {!isDeveloper && <Pressable onPress={() => navigation?.navigate('Feedback')}><Text style={styles.linkText}>Feedback / errori app</Text></Pressable>}
        <Pressable onPress={() => navigation?.navigate('Privacy')}><Text style={styles.linkText}>Privacy</Text></Pressable>
      </View>

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
              <Text style={styles.statValue}>{stats.avgRpe ? stats.avgRpe.toFixed(1) : '—'}</Text>
            </View>
          </View>
        </View>
      )}

      {!isCoach && (
        <View style={styles.connessioniSection}>
          <Text style={styles.sectionTitle}>Connessioni</Text>
          <Text style={typography.caption}>Collega le tue app e dispositivi per importare automaticamente gli allenamenti.</Text>

          <View style={styles.connectionItem}>
            <View style={styles.connectionRow}>
              <View style={styles.connectionBrand}>
                <View style={[styles.brandIcon, { backgroundColor: '#FC4C02' }]}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>⚡</Text>
                </View>
                <View>
                  <Text style={styles.brandTitle}>Strava</Text>
                  <Text style={styles.brandDesc}>
                    {stravaStatus?.connected
                      ? `Connesso: ${stravaStatus.athlete ? `${stravaStatus.athlete.firstname || ''} ${stravaStatus.athlete.lastname || ''}`.trim() : 'Account attivo'}`
                      : 'Corsa, ciclismo, camminata e nuoto'}
                  </Text>
                </View>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Switch
                  value={Boolean(stravaStatus?.connected)}
                  onValueChange={(val) => {
                    if (val) connectStrava();
                    else disconnectStrava();
                  }}
                  trackColor={{ true: '#10b981', false: colors.border }}
                />
                <Text style={[styles.switchStatusText, stravaStatus?.connected && { color: '#10b981' }]}>
                  {stravaStatus?.connected ? 'Connesso' : 'Disconnesso'}
                </Text>
              </View>
            </View>

            {stravaStatus?.connected ? (
              <View style={styles.stravaConnectedActions}>
                <Text style={styles.stravaSyncInfo}>
                  Ultimo sync: {stravaStatus.last_sync ? new Date(stravaStatus.last_sync).toLocaleString('it-IT') : 'Mai'}
                </Text>
                <Pressable
                  style={[styles.stravaSyncBtn, syncingStrava && { opacity: 0.6 }]}
                  onPress={syncStravaNow}
                  disabled={syncingStrava}
                >
                  {syncingStrava ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.stravaSyncBtnText}>🔄 Recupera allenamenti</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={{ marginTop: spacing.sm }}>
                <Pressable style={[styles.stravaQuickConnectBtn, connectingStrava && { opacity: 0.6 }]} onPress={connectStrava} disabled={connectingStrava}>
                  {connectingStrava ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.stravaQuickConnectText}>Connetti con Strava</Text>}
                </Pressable>
                <Text style={styles.stravaHint}>Si apre l'app Strava (o il sito): accedi, autorizza LPT Coach e verrai riportato qui.</Text>
                {stravaStatus && stravaStatus.hasServerApp === false && (
                  <Text style={styles.stravaWarning}>Il collegamento non è ancora attivo: il coach deve configurare l'app Strava sul server.</Text>
                )}
              </View>
            )}

          </View>

          <View style={styles.connectionItem}>
            <View style={styles.connectionRow}>
              <View style={[styles.connectionBrand, { flex: 1, minWidth: 0 }]}>
                <View style={[styles.brandIcon, { backgroundColor: '#007cc3' }]}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>G</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.brandTitle}>Garmin Connect</Text>
                  <Text style={styles.brandDesc}>
                    {garminStatus?.connected ? 'Connesso: attività e calendario sincronizzati' : 'Attività svolte in automatico e allenamenti sull\'orologio'}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Switch
                  value={Boolean(garminStatus?.connected)}
                  onValueChange={(val) => { if (val) connectGarmin(); else disconnectGarmin(); }}
                  disabled={garminStatus?.configured === false && !garminStatus?.connected}
                  trackColor={{ true: '#10b981', false: colors.border }}
                />
                <Text style={[styles.switchStatusText, garminStatus?.connected && { color: '#10b981' }]}>
                  {garminStatus?.connected ? 'Connesso' : 'Disconnesso'}
                </Text>
              </View>
            </View>

            {garminStatus?.connected ? (
              <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                <Text style={styles.stravaSyncInfo}>
                  Ultimo invio allenamenti: {garminStatus.last_push_at ? new Date(garminStatus.last_push_at).toLocaleString('it-IT') : 'mai'}
                  {garminStatus.last_activity_at ? ` · Ultima attività ricevuta: ${new Date(garminStatus.last_activity_at).toLocaleString('it-IT')}` : ''}
                </Text>
                <Text style={styles.stravaHint}>
                  Le attività che registri con l'orologio arrivano da sole nel calendario. {garminStatus.synced?.length ? `${garminStatus.synced.length} allenamenti dei prossimi ${garminStatus.giorni || 7} giorni sono già sul calendario Garmin.` : ''}
                </Text>
                {garminStatus.valid === false || garminStatus.last_error ? (
                  <Text style={styles.stravaWarning}>{garminStatus.valid === false ? 'Collegamento scaduto: scollega e ricollega Garmin.' : garminStatus.last_error}</Text>
                ) : null}
                <Text style={styles.stravaHint}>Con il pulsante qui sotto gli allenamenti da oggi ai prossimi 7 giorni vengono inviati al calendario Garmin; se il coach li modifica o li elimina, premilo di nuovo per aggiornarli.</Text>
                {Array.isArray(garminStatus.permissions) && garminStatus.permissions.length > 0 && !garminStatus.permissions.includes('HISTORICAL_DATA_EXPORT') && (
                  <Pressable onPress={() => connectGarminAccount().catch(() => {})}>
                    <Text style={styles.stravaWarning}>Per il Sync Garmin manca il permesso «dati storici»: tocca qui per ricollegare Garmin e attivarlo.</Text>
                  </Pressable>
                )}
                <Pressable style={[styles.garminBtn, garminBusy === 'refresh' && { opacity: 0.6 }]} onPress={refreshGarmin} disabled={garminBusy === 'refresh'}>
                  {garminBusy === 'refresh' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.stravaSyncBtnText}>🔄 Aggiorna attività da Garmin (titoli e descrizioni)</Text>}
                </Pressable>
                <Pressable style={[styles.garminBtn, garminBusy === 'sync' && { opacity: 0.6 }]} onPress={syncGarminNow} disabled={garminBusy === 'sync'}>
                  {garminBusy === 'sync' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.stravaSyncBtnText}>⌚ Invia ora i prossimi 7 giorni a Garmin</Text>}
                </Pressable>
              </View>
            ) : (
              <View style={{ marginTop: spacing.sm }}>
                <Pressable style={[styles.garminBtn, garminBusy === 'connect' && { opacity: 0.6 }, garminStatus?.configured === false && { opacity: 0.5 }]} onPress={connectGarmin} disabled={garminBusy === 'connect' || garminStatus?.configured === false}>
                  {garminBusy === 'connect' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.stravaQuickConnectText}>Connetti con Garmin</Text>}
                </Pressable>
                <Text style={styles.stravaHint}>Si apre Garmin Connect: accedi, consenti a LPT Coach di condividere le attività e di inviare gli allenamenti, poi verrai riportato qui. Puoi sempre importare un file .FIT a mano dal calendario.</Text>
                {garminStatus?.configured === false && (
                  <Text style={styles.stravaWarning}>Il collegamento Garmin non è ancora attivo sul server.</Text>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {isCoach && (
        <View style={styles.enduranceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Modulo Endurance</Text>
            <Text style={typography.caption}>Ora si attiva per singolo atleta: vai in Atleti e usa l'interruttore «Sezione endurance» sulla scheda di ognuno.</Text>
          </View>
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
        <Text style={styles.label}>Obiettivo allenamento</Text><TextInput value={profile.obiettivoallenamento || ''} onChangeText={(value) => update('obiettivoallenamento', value)} style={[styles.input, styles.area]} multiline placeholder="Obiettivo" />
        <Text style={styles.label}>Durata desiderata (minuti)</Text><TextInput value={String(profile.durata_allenamento_minuti || '')} onChangeText={(value) => update('durata_allenamento_minuti', value)} keyboardType="numeric" style={styles.input} placeholder="Durata (min)" />
        <Text style={styles.label}>Giorni di allenamento</Text><View style={styles.days}>{['Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato', 'Domenica'].map((day) => <Pressable key={day} onPress={() => toggleDay(day)} style={[styles.day, days.includes(day) && styles.dayActive]}><Text style={[styles.dayText, days.includes(day) && styles.dayTextActive]}>{day.slice(0, 3)}</Text></Pressable>)}</View>
        <Text style={styles.label}>Livello di forma fisica attuale</Text><TextInput value={profile.livellofitness || ''} onChangeText={(value) => update('livellofitness', value)} style={styles.input} placeholder="Livello" />
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
  connessioniSection: { width: '100%', maxWidth: 620, marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  connectionItem: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md, marginBottom: spacing.md },
  connectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  connectionBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  brandIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  brandDesc: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  switchStatusText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  stravaConnectedActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.xs },
  stravaSyncInfo: { fontSize: 11, color: '#15803d', fontWeight: '500' },
  stravaSyncBtn: { backgroundColor: '#FC4C02', borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  stravaSyncBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  stravaQuickConnectBtn: { backgroundColor: '#FC4C02', borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, alignSelf: 'flex-start' },
  stravaQuickConnectText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  stravaHint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 15 },
  garminBtn: { backgroundColor: '#007cc3', borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, alignSelf: 'flex-start' },
  garminRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  garminLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  stravaWarning: { fontSize: 11, color: colors.danger, marginTop: spacing.xs, fontWeight: '700' },
  warningBox: { width: '100%', maxWidth: 620, marginTop: spacing.xl, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', borderRadius: radius.md, padding: spacing.md },
  warningText: { color: '#92400E', fontWeight: '600' },
  emailCard: { alignSelf: 'stretch', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  emailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  emailTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emailBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  badgeOk: { backgroundColor: '#DCFCE7', color: '#166534' },
  badgeWarn: { backgroundColor: '#FEF3C7', color: '#92400E' },
  emailText: { fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 18 },
  emailBtn: { alignSelf: 'flex-start', marginTop: spacing.sm, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
  emailBtnText: { color: colors.primary, fontWeight: '800' },
  linksRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  linkText: { color: colors.accent, fontWeight: '700' },
  logoutBtn: { marginTop: spacing.xxl, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  logoutText: { color: colors.danger, fontWeight: '700' },
  form: { width: '100%', maxWidth: 620, marginTop: spacing.xl }, sectionTitle: { ...typography.h3, marginBottom: spacing.sm }, label: { ...typography.caption, marginTop: spacing.sm, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs }, area: { minHeight: 60, textAlignVertical: 'top' }, row: { flexDirection: 'row', gap: spacing.sm }, half: { flex: 1 }, sexRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }, sexChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface }, sexChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, sexText: { color: colors.textMuted, fontSize: 14 }, sexTextActive: { color: colors.primary, fontWeight: '700' }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, day: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface }, dayActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, dayText: { color: colors.textMuted }, dayTextActive: { color: colors.primary, fontWeight: '700' }, saveButton: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg }, saveText: { color: '#fff', fontWeight: '700' },
});
