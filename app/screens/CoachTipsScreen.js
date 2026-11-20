import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { colors, spacing, radius, typography } from '../theme';

const fmt = (value) => new Date(value).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Coach: consigli per un atleta (compaiono nella sua Home e gli arriva una notifica)
export default function CoachTipsScreen({ route }) {
  const athleteId = Number(route.params?.athleteId);
  const [tips, setTips] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/tips', { params: { utenteId: athleteId } });
      setTips(data || []);
    } catch {
      setTips([]);
    } finally {
      setLoading(false);
    }
  }, [athleteId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post('/tips', { utenteId: athleteId, testo: text.trim() });
      setText('');
      load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile inviare il consiglio');
    } finally {
      setSending(false);
    }
  };
  const remove = (tip) => Alert.alert('Elimina consiglio', 'Vuoi eliminarlo? Sparirà dalla Home dell\'atleta.', [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: async () => { await api.delete(`/tips/${tip.tip_id}`).catch(() => {}); load(); } },
  ]);

  return (
    <View style={styles.screen}>
      <View style={styles.composer}>
        <Text style={styles.subtitle}>{route.params?.athleteName ? `Per ${route.params.athleteName}` : 'Nuovo consiglio'}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.input}
          multiline
          placeholder="Recupero, alimentazione, tecnica, motivazione… lo vedrà nella sua Home"
        />
        <Pressable style={[styles.send, (!text.trim() || sending) && { opacity: 0.6 }]} onPress={send} disabled={!text.trim() || sending}>
          {sending ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={styles.sendText}>Invia consiglio</Text>
            </>
          )}
        </Pressable>
      </View>
      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} /> : (
        <FlatList
          data={tips}
          keyExtractor={(tip) => String(tip.tip_id)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListHeaderComponent={tips.length ? <Text style={styles.section}>Inviati</Text> : null}
          ListEmptyComponent={<Text style={styles.empty}>Nessun consiglio inviato a questo atleta.</Text>}
          renderItem={({ item }) => (
            <View style={styles.tip}>
              <Ionicons name="bulb" size={18} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={styles.tipText}>{item.testo}</Text>
                <Text style={styles.tipDate}>{fmt(item.created_at)}</Text>
              </View>
              <Pressable onPress={() => remove(item)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  composer: { backgroundColor: colors.surface, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  subtitle: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: spacing.xs },
  input: { minHeight: 90, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceAlt, textAlignVertical: 'top', fontSize: 15 },
  send: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.sm },
  sendText: { color: '#fff', fontWeight: '800' },
  section: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  tip: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  tipText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  tipDate: { ...typography.caption, marginTop: 4 },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.lg },
});
