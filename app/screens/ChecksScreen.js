import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Modal, TextInput, Image, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import DateField from '../components/DateField';
import { colors, spacing, radius, typography } from '../theme';

export const CHECK_STATUS = {
  richiesto: { label: 'Da inviare', color: '#B45309', bg: '#FEF3C7', icon: 'time-outline' },
  inviato: { label: 'Da commentare', color: '#1D4ED8', bg: '#DBEAFE', icon: 'mail-unread-outline' },
  revisionato: { label: 'Commentato', color: '#047857', bg: '#ECFDF5', icon: 'checkmark-circle-outline' },
};
export const fmtDate = (value) => (value ? new Date(String(value).length <= 10 ? `${value}T12:00:00` : value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function StatusChip({ stato, isCoach }) {
  const status = CHECK_STATUS[stato] || CHECK_STATUS.richiesto;
  const label = !isCoach && stato === 'inviato' ? 'Inviato al coach' : status.label;
  return (
    <View style={[styles.chip, { backgroundColor: status.bg }]}>
      <Ionicons name={status.icon} size={13} color={status.color} />
      <Text style={[styles.chipText, { color: status.color }]}>{label}</Text>
    </View>
  );
}

export default function ChecksScreen({ navigation }) {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();
  const [checks, setChecks] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [scadenza, setScadenza] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); });
  const [nota, setNota] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, box] = await Promise.all([
        targetUserId ? api.get('/checks', { params: { utenteId: targetUserId } }) : Promise.resolve({ data: [] }),
        isCoach ? api.get('/checks/inbox') : Promise.resolve({ data: [] }),
      ]);
      setChecks(list.data || []);
      setInbox(box.data || []);
    } catch {
      setChecks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetUserId, isCoach]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requestCheck = async () => {
    setSending(true);
    try {
      await api.post('/checks', { utenteId: targetUserId, scadenza, nota });
      setRequestOpen(false);
      setNota('');
      await load();
      Alert.alert('Check richiesto', `${selectedAthlete?.nome || 'L\'atleta'} riceverà una notifica.`);
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile richiedere il check');
    } finally {
      setSending(false);
    }
  };

  const open = (check) => navigation.navigate('CheckDetail', { checkId: check.check_id });

  return (
    <View style={styles.screen}>
      {isCoach && <AthletePicker />}
      {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {isCoach && inbox.length > 0 && (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Da commentare · tutti gli atleti</Text>
              {inbox.map((check) => (
                <Pressable key={check.check_id} style={styles.inboxRow} onPress={() => open(check)}>
                  <Ionicons name="images-outline" size={20} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inboxName}>{check.atleta_nome}</Text>
                    <Text style={styles.meta}>Inviato il {fmtDate(check.inviato_at)}{check.peso_kg ? ` · ${check.peso_kg} kg` : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.headerRow}>
            <Text style={typography.h2}>{isCoach ? `Check di ${selectedAthlete?.nome || 'atleta'}` : 'I miei check'}</Text>
            {isCoach && targetUserId && (
              <Pressable style={styles.primarySmall} onPress={() => setRequestOpen(true)}>
                <Ionicons name="camera-outline" size={16} color="#fff" />
                <Text style={styles.primarySmallText}>Richiedi check</Text>
              </Pressable>
            )}
          </View>

          {checks.map((check) => (
            <Pressable key={check.check_id} style={({ pressed }) => [styles.card, check.stato === 'richiesto' && !isCoach && styles.cardTodo, pressed && { opacity: 0.85 }]} onPress={() => open(check)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Check del {fmtDate(check.inviato_at || check.created_at)}</Text>
                <StatusChip stato={check.stato} isCoach={isCoach} />
              </View>
              {check.stato === 'richiesto' && (
                <Text style={styles.meta}>{check.scadenza ? `Da inviare entro il ${fmtDate(check.scadenza)}` : 'In attesa delle foto'}{check.nota_richiesta ? ` · ${check.nota_richiesta}` : ''}</Text>
              )}
              {check.foto.length > 0 && (
                <View style={styles.thumbs}>
                  {check.foto.slice(0, 4).map((photo) => <Image key={photo.photo_id} source={{ uri: photo.url }} style={styles.thumb} />)}
                </View>
              )}
              {(check.peso_kg || check.commento_coach) && (
                <Text style={styles.meta} numberOfLines={2}>
                  {check.peso_kg ? `Peso ${check.peso_kg} kg` : ''}{check.peso_kg && check.commento_coach ? ' · ' : ''}{check.commento_coach ? `Coach: ${check.commento_coach}` : ''}
                </Text>
              )}
            </Pressable>
          ))}
          {!checks.length && (
            <View style={styles.empty}>
              <Ionicons name="camera-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>{isCoach ? 'Nessun check per questo atleta. Premi "Richiedi check" per chiedere le foto.' : 'Nessun check richiesto. Quando il coach te lo chiede, lo trovi qui e ricevi una notifica.'}</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={requestOpen} transparent animationType="fade" onRequestClose={() => setRequestOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>Richiedi check</Text>
            <Text style={styles.meta}>{selectedAthlete?.nome} riceverà una notifica e potrà caricare le foto fronte, lato e retro.</Text>
            <Text style={styles.label}>Da inviare entro</Text>
            <DateField value={scadenza} onChange={setScadenza} />
            <Text style={styles.label}>Nota per l'atleta</Text>
            <TextInput value={nota} onChangeText={setNota} style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline placeholder="Nota" />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setRequestOpen(false)}><Text style={styles.secondaryText}>Annulla</Text></Pressable>
              <Pressable style={styles.primaryButton} onPress={requestCheck} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Richiedi</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  panelTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },
  inboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  inboxName: { fontWeight: '800', color: colors.text },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  primarySmall: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
  primarySmallText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardTodo: { borderColor: '#F59E0B', borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '800' },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  thumbs: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  thumb: { width: 64, height: 86, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyText: { ...typography.caption, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 460, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  label: { ...typography.caption, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  primaryButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '700' },
});
