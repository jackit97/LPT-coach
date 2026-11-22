import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import ConsentChecks from '../components/ConsentChecks';
import { colors, spacing, radius } from '../theme';

// Primo accesso dopo l'aggiornamento (o informativa cambiata): i consensi servono per continuare a usare l'app
export default function ConsentScreen() {
  const { refreshAccountStatus, logout, user } = useAuth();
  const [consents, setConsents] = useState({ privacy: false, datiSalute: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!consents.privacy || !consents.datiSalute) return setError('Per continuare servono entrambi i consensi.');
    setSaving(true);
    setError('');
    try {
      await api.post('/users/me/consent', consents);
      await refreshAccountStatus();
    } catch (e) {
      setError(e?.response?.data?.message || 'Salvataggio non riuscito, riprova.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy e consensi</Text>
      <Text style={styles.text}>
        Ciao {user?.nome || ''}, abbiamo aggiornato l'informativa privacy di LPT Coach. Per continuare a usare l'app
        conferma di averla letta e il consenso al trattamento dei dati sulla salute.
      </Text>
      <ConsentChecks value={consents} onChange={setConsents} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continua</Text>}
      </Pressable>
      <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Esci</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  text: { fontSize: 14, color: colors.textMuted, lineHeight: 21, marginTop: spacing.sm },
  error: { color: colors.danger, marginTop: spacing.md, fontWeight: '700' },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xl },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  logout: { alignItems: 'center', marginTop: spacing.lg },
  logoutText: { color: colors.textMuted, fontWeight: '700' },
});
