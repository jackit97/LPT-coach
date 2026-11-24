import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../api/client';
import { fmtAgo } from './DevDashboardScreen';
import { FEEDBACK_STATUS } from '../FeedbackScreen';
import { colors, spacing, radius } from '../../theme';
import FeedbackThread from '../../components/FeedbackThread';

// Segnalazioni di coach e atleti: chat con l'utente (notifica ed email a ogni risposta) e stato del ticket
const TYPE = { bug: '🐞 Bug', miglioramento: '💡 Idea', altro: '💬 Altro' };
const ROLE = { cliente: 'Atleta', personal_trainer: 'Coach', developer: 'Developer' };

function FeedbackCard({ item, onSaved, initiallyOpen }) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(!!initiallyOpen);
  const save = async (changes) => {
    setSaving(true);
    try { await api.put(`/dev/admin/feedback/${item.feedback_id}`, changes); onSaved(); } catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Salvataggio non riuscito'); } finally { setSaving(false); }
  };
  const status = FEEDBACK_STATUS[item.stato] || FEEDBACK_STATUS.nuovo;
  const replies = Math.max(0, Number(item.n_messaggi) || 0);
  return (
    <View style={[styles.card, (item.stato === 'nuovo' || item.da_leggere) && styles.cardNew]}>
      <Pressable onPress={() => setOpen((value) => !value)}>
        <View style={styles.head}>
          <Text style={styles.type}>{TYPE[item.tipo] || item.tipo}</Text>
          <Text style={[styles.badge, { color: status.color, borderColor: status.color }]}>{item.stato === 'nuovo' ? 'Nuova' : status.label}</Text>
          {item.da_leggere && item.stato !== 'nuovo' && <Text style={styles.unread}>Nuovo messaggio</Text>}
          <Text style={styles.ago}>{fmtAgo(item.updated_at || item.created_at)}</Text>
        </View>
        {!open && <Text style={styles.message} numberOfLines={3}>{item.messaggio}</Text>}
        <Text style={styles.meta}>
          {[item.nome, item.cognome].filter(Boolean).join(' ') || 'Utente eliminato'}{item.ruolo ? ` (${ROLE[item.ruolo] || item.ruolo})` : ''}{item.email ? ` · ${item.email}` : ''}
          {item.schermata ? ` · ${item.schermata}` : ''}{item.versione_app ? ` · v ${item.versione_app}` : ''}
        </Text>
        <Text style={styles.toggle}>{open ? '▲ Chiudi conversazione' : `▼ Apri conversazione${replies ? ` (${replies} ${replies === 1 ? 'messaggio' : 'messaggi'})` : ''}`}</Text>
      </Pressable>
      {open && <FeedbackThread feedbackId={item.feedback_id} isDev onChanged={onSaved} />}
      <View style={styles.actions}>
        {['in_corso', 'risolto', 'chiuso'].map((stato) => (
          <Pressable key={stato} style={[styles.action, item.stato === stato && styles.actionOn]} disabled={saving} onPress={() => save({ stato })}>
            <Text style={[styles.actionText, item.stato === stato && { color: '#fff' }]}>{FEEDBACK_STATUS[stato].label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function DevFeedbackScreen({ route }) {
  const focusId = Number(route?.params?.feedbackId) || null;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const { data } = await api.get('/dev/admin/feedback'); setRows(data || []); } catch { setRows([]); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const open = rows.filter((row) => ['nuovo', 'in_corso'].includes(row.stato));
  const closed = rows.filter((row) => !['nuovo', 'in_corso'].includes(row.stato));
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {loading ? <ActivityIndicator color={colors.primary} /> : (
        <>
          <Text style={styles.section}>Da gestire ({open.length})</Text>
          {open.length === 0 ? <Text style={styles.empty}>Nessuna segnalazione aperta.</Text> : open.map((item) => <FeedbackCard key={item.feedback_id} item={item} onSaved={load} initiallyOpen={item.feedback_id === focusId || item.da_leggere} />)}
          {closed.length > 0 && <Text style={styles.section}>Gestite ({closed.length})</Text>}
          {closed.map((item) => <FeedbackCard key={item.feedback_id} item={item} onSaved={load} initiallyOpen={item.feedback_id === focusId} />)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 960, width: '100%', alignSelf: 'center' },
  section: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.md, marginBottom: spacing.sm },
  empty: { color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardNew: { borderColor: colors.primary, borderWidth: 1.5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  type: { fontWeight: '800', color: colors.text },
  badge: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  ago: { flex: 1, textAlign: 'right', fontSize: 12, color: colors.textMuted },
  message: { fontSize: 15, color: colors.text, lineHeight: 21 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  unread: { fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  toggle: { fontSize: 12, fontWeight: '800', color: colors.primary, marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  action: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  actionOn: { backgroundColor: colors.primary },
  actionText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
});
