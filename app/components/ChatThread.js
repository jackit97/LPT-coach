import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { colors, spacing, radius } from '../theme';

// Chat generica a botta e risposta con conferma di lettura (segnalazioni al developer, report atleta-coach).
// load() -> { messages: [{ key, mine, author, testo, created_at }], otherReadAt, error }; send(testo) invia.
const fmt = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function ChatThread({ load: loadThread, send: sendMessage, placeholder = 'Scrivi un messaggio', emptyText = null, onChanged, reloadKey }) {
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setThread(await loadThread());
    } catch (e) {
      setThread({ messages: [], error: e?.response?.data?.message || 'Conversazione non disponibile' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      await sendMessage(value);
      setText('');
      await load();
      onChanged?.();
    } catch (e) {
      Alert.alert('Messaggio', e?.response?.data?.message || 'Invio non riuscito');
    } finally {
      setSending(false);
    }
  };

  if (!thread) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />;
  const otherReadAt = thread.otherReadAt;
  const lastMineIndex = thread.messages.map((message) => message.mine).lastIndexOf(true);

  return (
    <View style={styles.wrap}>
      {!thread.messages.length && !!emptyText && <Text style={styles.empty}>{emptyText}</Text>}
      {thread.messages.map((message, index) => {
        const own = message.mine;
        const seen = own && otherReadAt && new Date(otherReadAt) >= new Date(message.created_at);
        return (
          <View key={message.key ?? index} style={[styles.row, own ? styles.rowOwn : styles.rowOther]}>
            <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
              {!!message.author && <Text style={[styles.author, own && { color: 'rgba(255,255,255,0.75)' }]}>{message.author}</Text>}
              <Text style={[styles.text, own && { color: '#fff' }]}>{message.testo}</Text>
              <Text style={[styles.time, own && { color: 'rgba(255,255,255,0.8)' }]}>{fmt(message.created_at)}</Text>
            </View>
            {own && index === lastMineIndex && (
              <View style={styles.receipt}>
                <Ionicons name={seen ? 'checkmark-done' : 'checkmark'} size={14} color={seen ? colors.primary : colors.textMuted} />
                <Text style={[styles.receiptText, seen && { color: colors.primary }]}>
                  {seen ? `Visualizzato ${fmt(otherReadAt)}` : 'Inviato'}
                </Text>
              </View>
            )}
          </View>
        );
      })}
      {!!thread.error && <Text style={styles.error}>{thread.error}</Text>}
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.input}
          multiline
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
        />
        <Pressable style={[styles.send, (!text.trim() || sending) && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || sending} accessibilityLabel="Invia">
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, gap: 6 },
  row: { maxWidth: '85%' },
  rowOwn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 14, paddingHorizontal: spacing.md, paddingVertical: 8 },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  author: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.textMuted, marginBottom: 2 },
  text: { fontSize: 14, lineHeight: 20, color: colors.text },
  time: { fontSize: 10, color: colors.textMuted, marginTop: 3, alignSelf: 'flex-end' },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  receiptText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 12 },
  empty: { color: colors.textMuted, fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surface, minHeight: 40, maxHeight: 140, fontSize: 14, color: colors.text, textAlignVertical: 'top' },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
