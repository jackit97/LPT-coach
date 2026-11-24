import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { appVersion } from '../utils/errorReporter';
import { colors, spacing, radius } from '../theme';
import FeedbackThread from '../components/FeedbackThread';

// Feedback / errori app: coach e atleti segnalano cosa non va o cosa migliorare; arriva al profilo developer.
const TYPES = [
  { key: 'bug', label: 'Qualcosa non funziona', icon: 'bug-outline' },
  { key: 'miglioramento', label: 'Idea / miglioramento', icon: 'bulb-outline' },
  { key: 'altro', label: 'Altro', icon: 'chatbubble-ellipses-outline' },
];
export const FEEDBACK_STATUS = {
  nuovo: { label: 'Inviata', color: colors.primary },
  in_corso: { label: 'In lavorazione', color: '#D97706' },
  risolto: { label: 'Risolta', color: colors.success },
  chiuso: { label: 'Chiusa', color: colors.textMuted },
};

export default function FeedbackScreen({ route }) {
  const focusId = Number(route?.params?.feedbackId) || null;
  const [openId, setOpenId] = useState(focusId);
  React.useEffect(() => { if (focusId) setOpenId(focusId); }, [focusId]);
  const [tipo, setTipo] = useState('bug');
  const [schermata, setSchermata] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/dev/feedback/mine'); setMine(data || []); } catch { setMine([]); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    if (messaggio.trim().length < 5) return Alert.alert('Feedback', 'Descrivi in qualche parola cosa non va o cosa vorresti.');
    setSending(true);
    try {
      const { data } = await api.post('/dev/feedback', { tipo, messaggio: messaggio.trim(), schermata: schermata.trim() || null, versione: appVersion() });
      setMessaggio('');
      setSchermata('');
      Alert.alert('Grazie!', data?.message || 'Segnalazione inviata');
      load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Invio non riuscito');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Feedback / errori app</Text>
      <Text style={styles.intro}>Hai trovato un errore o hai un'idea per migliorare LPT Coach? Scrivilo qui: arriva direttamente a chi sviluppa l'app e riceverai una notifica (ed email) a ogni risposta e potrai rispondere qui sotto, come in una chat.</Text>

      <Text style={styles.label}>Di cosa si tratta?</Text>
      <View style={styles.types}>
        {TYPES.map((item) => (
          <Pressable key={item.key} style={[styles.type, tipo === item.key && styles.typeOn]} onPress={() => setTipo(item.key)}>
            <Ionicons name={item.icon} size={18} color={tipo === item.key ? colors.primary : colors.textMuted} />
            <Text style={[styles.typeText, tipo === item.key && { color: colors.primary }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Dove nell'app? (facoltativo)</Text>
      <TextInput value={schermata} onChangeText={setSchermata} style={styles.input} placeholder="Schermata" placeholderTextColor={colors.textMuted} />
      <Text style={styles.label}>{tipo === 'bug' ? 'Cosa è successo? Cosa stavi facendo?' : 'Descrivi la tua idea'}</Text>
      <TextInput value={messaggio} onChangeText={setMessaggio} style={[styles.input, styles.area]} multiline placeholder="Scrivi qui" placeholderTextColor={colors.textMuted} />
      <Pressable style={[styles.send, sending && { opacity: 0.7 }]} onPress={send} disabled={sending}>
        {sending ? <ActivityIndicator color="#fff" /> : <><Ionicons name="send" size={16} color="#fff" /><Text style={styles.sendText}>Invia segnalazione</Text></>}
      </Pressable>

      <Text style={styles.section}>Le mie segnalazioni</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : mine.length === 0 ? (
        <Text style={styles.empty}>Nessuna segnalazione inviata.</Text>
      ) : mine.map((item) => {
        const status = FEEDBACK_STATUS[item.stato] || FEEDBACK_STATUS.nuovo;
        const open = openId === item.feedback_id;
        const replies = Number(item.n_messaggi) || (item.risposta ? 1 : 0);
        return (
          <View key={item.feedback_id} style={[styles.card, item.da_leggere && styles.cardUnread]}>
            <Pressable onPress={() => { setOpenId(open ? null : item.feedback_id); if (!open && item.da_leggere) setTimeout(load, 800); }}>
              <View style={styles.cardHead}>
                <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {item.da_leggere && <Text style={styles.unread}>Nuova risposta</Text>}
                  <Text style={[styles.badge, { color: status.color, borderColor: status.color }]}>{status.label}</Text>
                </View>
              </View>
              {!open && <Text style={styles.cardText} numberOfLines={2}>{item.messaggio}</Text>}
              <Text style={styles.toggle}>{open ? '▲ Chiudi' : replies ? `▼ Apri conversazione (${replies} ${replies === 1 ? 'messaggio' : 'messaggi'})` : '▼ Apri conversazione'}</Text>
            </Pressable>
            {open && <FeedbackThread feedbackId={item.feedback_id} onChanged={load} />}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  intro: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.xs },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  type: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface },
  typeOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  typeText: { fontWeight: '700', color: colors.textMuted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surface, fontSize: 15, color: colors.text },
  area: { minHeight: 120, textAlignVertical: 'top' },
  send: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  section: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardDate: { fontSize: 12, color: colors.textMuted },
  badge: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  cardText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  cardUnread: { borderColor: colors.primary, borderWidth: 1.5 },
  unread: { fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  toggle: { fontSize: 12, fontWeight: '800', color: colors.primary, marginTop: spacing.sm },
  reply: { marginTop: spacing.sm, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.sm },
  replyLabel: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', marginBottom: 2 },
});
