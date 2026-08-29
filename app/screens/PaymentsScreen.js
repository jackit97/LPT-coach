import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';

const STATO_COLORS = { 'Pagato': colors.success, 'In sospeso': colors.warning, 'Scaduto': colors.danger };

export default function PaymentsScreen({ navigation }) {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importo, setImporto] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [causale, setCausale] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!targetUserId) { setPayments([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/payments', { params: { utenteId: targetUserId } });
      setPayments(data || []);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createPayment = async () => {
    if (!importo) return Alert.alert('Errore', "L'importo e richiesto");
    setSaving(true);
    try {
      await api.post('/payments', { utenteId: targetUserId, importo: Number(importo), scadenza: scadenza || null, causale });
      setModalOpen(false);
      setImporto(''); setScadenza(''); setCausale('');
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile creare il pagamento');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (payment) => {
    await api.put(`/payments/${payment.pagamentoid}`, { stato: 'Pagato', datapagamento: new Date().toISOString() });
    load();
  };

  if (isCoach && !selectedAthlete) {
    return (
      <View style={styles.center}>
        <Text style={typography.h2}>Seleziona un atleta</Text>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Clients')}>
          <Text style={styles.primaryButtonText}>Vai ai tuoi atleti</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isCoach && <AthletePicker />}
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => String(item.pagamentoid)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<Text style={styles.empty}>Nessun pagamento registrato.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>€{Number(item.importo).toFixed(2)}</Text>
                <Text style={typography.caption}>{item.causale || 'Pagamento'}</Text>
                {!!item.scadenza && <Text style={typography.caption}>Scadenza: {String(item.scadenza).slice(0, 10)}</Text>}
              </View>
              <View style={[styles.statusPill, { backgroundColor: (STATO_COLORS[item.stato] || colors.textMuted) + '1A' }]}>
                <Text style={{ color: STATO_COLORS[item.stato] || colors.textMuted, fontWeight: '700', fontSize: 12 }}>{item.stato}</Text>
              </View>
              {isCoach && item.stato !== 'Pagato' && (
                <Pressable onPress={() => markPaid(item)} style={styles.markPaidBtn}>
                  <Text style={styles.markPaidText}>✓</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      {isCoach && targetUserId && (
        <Pressable style={styles.fab} onPress={() => setModalOpen(true)}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>Nuovo pagamento</Text>
            <Text style={styles.fieldLabel}>Importo (€)</Text>
            <TextInput value={importo} onChangeText={setImporto} keyboardType="numeric" style={styles.input} placeholder="59.99" />
            <Text style={styles.fieldLabel}>Scadenza (YYYY-MM-DD)</Text>
            <TextInput value={scadenza} onChangeText={setScadenza} style={styles.input} placeholder="2026-09-30" />
            <Text style={styles.fieldLabel}>Causale</Text>
            <TextInput value={causale} onChangeText={setCausale} style={styles.input} placeholder="Abbonamento mensile" />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setModalOpen(false)}>
                <Text style={styles.secondaryButtonText}>Annulla</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={createPayment} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Crea</Text>}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  markPaidBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  markPaidText: { color: colors.success, fontWeight: '700' },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  fabText: { color: colors.textInverse, fontSize: 28, fontWeight: '700', marginTop: -2 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignItems: 'center', flex: 1 },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  secondaryButton: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flex: 1 },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
});
