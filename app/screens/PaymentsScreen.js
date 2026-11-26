import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert, Modal, Platform, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import DateField from '../components/DateField';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';
import { fullName } from '../utils/names';

const STATO_COLORS = { 'Pagato': colors.success, 'In sospeso': colors.warning, 'Scaduto': colors.danger, 'In verifica': '#2563EB' };

const fmtIban = (iban) => String(iban || '').replace(/(.{4})/g, '$1 ').trim();

// Copia negli appunti (web); altrimenti mostra il testo da copiare a mano
async function copyText(text) {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fallback sotto */ }
  Alert.alert('Copia', text);
  return false;
}

// Popup dell'atleta per saldare un pagamento: bonifico (IBAN da copiare) oppure carta con Stripe
function PayModal({ payment, athleteName, onClose, onDone }) {
  const [methods, setMethods] = useState(null);
  const [copied, setCopied] = useState(null);
  const [busy, setBusy] = useState(null);
  React.useEffect(() => {
    if (!payment) return;
    setCopied(null);
    api.get('/payments/methods').then(({ data }) => setMethods(data)).catch(() => setMethods({ bonifico: null, stripe: false }));
  }, [payment]);
  if (!payment) return null;
  const importo = `€${Number(payment.importo).toFixed(2)}`;
  const causale = `LPT Coach - ${payment.causale || 'Pagamento'}${athleteName ? ` - ${athleteName}` : ''}`;
  const bank = methods?.bonifico;
  const copy = async (key, text) => { if (await copyText(text)) { setCopied(key); setTimeout(() => setCopied(null), 2000); } };
  const bonificoFatto = async () => {
    setBusy('bonifico');
    try {
      const { data } = await api.post(`/payments/${payment.pagamentoid}/bonifico`);
      Alert.alert('Bonifico', data?.message || 'Grazie! Il coach confermerà il pagamento.');
      onDone();
    } catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Non è stato possibile inviare la segnalazione'); }
    finally { setBusy(null); }
  };
  const payStripe = async () => {
    setBusy('stripe');
    try {
      const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
      const { data } = await api.post(`/payments/${payment.pagamentoid}/stripe`, { origin: isWeb ? window.location.origin : undefined });
      if (isWeb) { window.location.href = data.url; return; }
      await Linking.openURL(data.url);
    } catch (e) { Alert.alert('Pagamento con carta', e?.response?.data?.message || 'Non è stato possibile aprire Stripe'); }
    finally { setBusy(null); }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.payOverlay}>
        <View style={styles.payCard}>
          <Text style={styles.payAmount}>{importo}</Text>
          <Text style={styles.payReason}>{payment.causale || 'Pagamento'}{payment.scadenza ? ` · scade il ${String(payment.scadenza).slice(0, 10).split('-').reverse().join('/')}` : ''}</Text>
          {payment.stato === 'In verifica' && <Text style={styles.payInfo}>Hai già segnalato un bonifico: il coach lo confermerà appena vede l'accredito.</Text>}
          {!methods ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : (
            <>
              <View style={styles.payBlock}>
                <Text style={styles.payBlockTitle}>🏦 Paga con bonifico</Text>
                {bank ? (
                  <>
                    <Text style={styles.payLabel}>Intestatario</Text>
                    <Text style={styles.payValue}>{bank.intestatario}{bank.banca ? ` · ${bank.banca}` : ''}</Text>
                    <Text style={styles.payLabel}>IBAN</Text>
                    <View style={styles.copyRow}>
                      <Text style={styles.iban} selectable>{fmtIban(bank.iban)}</Text>
                      <Pressable style={styles.copyBtn} onPress={() => copy('iban', bank.iban)}><Text style={styles.copyText}>{copied === 'iban' ? 'Copiato ✓' : 'Copia'}</Text></Pressable>
                    </View>
                    <Text style={styles.payLabel}>Causale</Text>
                    <View style={styles.copyRow}>
                      <Text style={[styles.payValue, { flex: 1 }]} selectable>{causale}</Text>
                      <Pressable style={styles.copyBtn} onPress={() => copy('causale', causale)}><Text style={styles.copyText}>{copied === 'causale' ? 'Copiato ✓' : 'Copia'}</Text></Pressable>
                    </View>
                    {bank.esempio && <Text style={styles.payNote}>IBAN di esempio: il coach deve ancora inserire quello vero.</Text>}
                    <Pressable style={[styles.payButtonSecondary, busy === 'bonifico' && { opacity: 0.6 }]} onPress={bonificoFatto} disabled={!!busy}>
                      {busy === 'bonifico' ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.payButtonSecondaryText}>Ho fatto il bonifico</Text>}
                    </Pressable>
                  </>
                ) : <Text style={styles.payNote}>Coordinate bancarie non disponibili.</Text>}
              </View>
              <Text style={styles.payOr}>oppure</Text>
              <Pressable style={[styles.payButton, (!methods.stripe || busy) && { opacity: 0.5 }]} onPress={payStripe} disabled={!methods.stripe || !!busy}>
                {busy === 'stripe' ? <ActivityIndicator color="#fff" /> : <Text style={styles.payButtonText}>💳 Paga con carta ({importo})</Text>}
              </Pressable>
              <Text style={styles.payNote}>{methods.stripe ? 'Pagamento sicuro su Stripe: carta, Apple Pay o Google Pay. Al termine torni nell\'app.' : 'Il pagamento con carta non è ancora attivo.'}</Text>
            </>
          )}
          <Pressable style={styles.payClose} onPress={onClose}><Text style={styles.payCloseText}>Chiudi</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function PaymentsScreen({ navigation, route }) {
  const { isCoach, user } = useAuth();
  const [payModal, setPayModal] = useState(null);
  const { selectedAthlete, targetUserId, clients } = useAthlete();
  // Coach dalla barra in basso: panoramica di tutti gli atleti; dalla pagina di un atleta: solo i suoi
  const overview = isCoach && !route?.params?.fromHub;
  const [filter, setFilter] = useState('aperti');
  const [payAthlete, setPayAthlete] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importo, setImporto] = useState('');
  const [scadenza, setScadenza] = useState('');
  const [causale, setCausale] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (overview) {
      setLoading(true);
      try {
        const { data } = await api.get('/payments/all');
        setPayments(data || []);
      } catch {
        setPayments([]);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!targetUserId) { setPayments([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/payments', { params: { utenteId: targetUserId } });
      setPayments(data || []);
    } finally {
      setLoading(false);
    }
  }, [targetUserId, overview]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createPayment = async () => {
    if (!importo) return Alert.alert('Errore', "L'importo e richiesto");
    setSaving(true);
    try {
      const athleteId = overview ? payAthlete : targetUserId;
      if (!athleteId) { Alert.alert('Errore', 'Scegli l\'atleta'); return; }
      await api.post('/payments', { utenteId: athleteId, importo: Number(importo), scadenza: scadenza || null, causale });
      setModalOpen(false);
      setImporto(''); setScadenza(''); setCausale('');
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile creare il pagamento');
    } finally {
      setSaving(false);
    }
  };

  // bonifico segnalato dall'atleta: il coach conferma l'accredito (o lo rimanda "in sospeso")
  const [confirming, setConfirming] = useState(null);
  const confirmTransfer = (payment, ricevuto) => {
    const label = `€${Number(payment.importo).toFixed(2)}${payment.atleta ? ` di ${payment.atleta}` : ''}`;
    Alert.alert(
      ricevuto ? 'Conferma bonifico' : 'Bonifico non ricevuto',
      ricevuto ? `Confermi di aver ricevuto il bonifico di ${label}? L'atleta riceverà una notifica.` : `Il bonifico di ${label} non risulta ancora? Il pagamento torna "In sospeso" e l'atleta viene avvisato.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: ricevuto ? 'Confermo' : 'Non ricevuto',
          onPress: async () => {
            setConfirming(payment.pagamentoid);
            try { await api.post(`/payments/${payment.pagamentoid}/conferma-bonifico`, { ricevuto }); await load(); }
            catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Operazione non riuscita'); }
            finally { setConfirming(null); }
          },
        },
      ],
    );
  };
  const TransferActions = ({ item }) => (item.stato === 'In verifica' ? (
    <View style={styles.transferBox}>
      <Text style={styles.transferText}>
        🏦 Bonifico segnalato dall'atleta{item.segnalato_at ? ` il ${new Date(item.segnalato_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}` : ''}: controlla l'accredito.
      </Text>
      <View style={styles.transferActions}>
        <Pressable style={[styles.transferOk, confirming === item.pagamentoid && { opacity: 0.6 }]} disabled={confirming === item.pagamentoid} onPress={() => confirmTransfer(item, true)}>
          <Text style={styles.transferOkText}>✓ Ricevuto</Text>
        </Pressable>
        <Pressable style={styles.transferNo} disabled={confirming === item.pagamentoid} onPress={() => confirmTransfer(item, false)}>
          <Text style={styles.transferNoText}>Non ricevuto</Text>
        </Pressable>
      </View>
    </View>
  ) : null);
  const methodLabel = (item) => (item.stato === 'Pagato' && item.metodo ? ({ stripe: ' · carta', bonifico: ' · bonifico' }[item.metodo] || '') : '');

  const markPaid = async (payment) => {
    await api.put(`/payments/${payment.pagamentoid}`, { stato: 'Pagato', datapagamento: new Date().toISOString() });
    load();
  };

  const today = new Date().toISOString().slice(0, 10);
  const isLate = (item) => item.stato !== 'Pagato' && item.scadenza && String(item.scadenza).slice(0, 10) < today;
  const openAmount = payments.filter((item) => item.stato !== 'Pagato').reduce((sum, item) => sum + Number(item.importo || 0), 0);
  const lateCount = payments.filter(isLate).length;
  const shown = !overview ? payments : payments.filter((item) => (filter === 'aperti' ? item.stato !== 'Pagato' : filter === 'pagati' ? item.stato === 'Pagato' : true));

  if (overview) {
    return (
      <View style={styles.screen}>
        <View style={styles.summary}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Da incassare</Text>
            <Text style={styles.summaryValue}>€{openAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Scaduti</Text>
            <Text style={[styles.summaryValue, lateCount > 0 && { color: colors.danger }]}>{lateCount}</Text>
          </View>
        </View>
        <View style={styles.filters}>
          {[['aperti', 'Da incassare'], ['pagati', 'Pagati'], ['tutti', 'Tutti']].map(([key, label]) => (
            <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filterChip, filter === key && styles.filterChipActive]}>
              <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
          <FlatList
            data={shown}
            keyExtractor={(item) => String(item.pagamentoid)}
            contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 90 }}
            ListEmptyComponent={<Text style={styles.empty}>{filter === 'aperti' ? 'Nessun pagamento da incassare.' : 'Nessun pagamento.'}</Text>}
            renderItem={({ item }) => (
              <View style={[styles.cardWrap, isLate(item) && { borderColor: '#FECACA' }, item.stato === 'In verifica' && { borderColor: '#93C5FD' }]}>
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.athleteName} numberOfLines={1}>{item.atleta}</Text>
                  <Text style={typography.h3}>€{Number(item.importo).toFixed(2)}</Text>
                  <Text style={typography.caption}>{item.causale || 'Pagamento'}{item.scadenza ? ` · scade il ${String(item.scadenza).slice(0, 10).split('-').reverse().join('/')}` : ''}{methodLabel(item)}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: ((isLate(item) ? colors.danger : STATO_COLORS[item.stato]) || colors.textMuted) + '1A' }]}>
                  <Text style={{ color: (isLate(item) ? colors.danger : STATO_COLORS[item.stato]) || colors.textMuted, fontWeight: '700', fontSize: 12 }}>{isLate(item) ? 'Scaduto' : item.stato}</Text>
                </View>
                {item.stato !== 'Pagato' && item.stato !== 'In verifica' && (
                  <Pressable onPress={() => markPaid(item)} style={styles.markPaidBtn} accessibilityLabel="Segna pagato">
                    <Text style={styles.markPaidText}>✓</Text>
                  </Pressable>
                )}
              </View>
              <TransferActions item={item} />
              </View>
            )}
          />
        )}
        <Pressable style={styles.fab} onPress={() => { setPayAthlete(selectedAthlete?.utenteid || clients[0]?.utenteid || null); setModalOpen(true); }}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
        <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={typography.h2}>Nuovo pagamento</Text>
              <Text style={styles.fieldLabel}>Atleta</Text>
              <View style={styles.athleteChips}>
                {clients.map((client) => (
                  <Pressable key={client.utenteid} onPress={() => setPayAthlete(client.utenteid)} style={[styles.filterChip, payAthlete === client.utenteid && styles.filterChipActive]}>
                    <Text style={[styles.filterText, payAthlete === client.utenteid && styles.filterTextActive]}>{fullName(client)}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Importo (€)</Text>
              <TextInput value={importo} onChangeText={setImporto} keyboardType="numeric" style={styles.input} placeholder="Importo" />
              <Text style={styles.fieldLabel}>Scadenza</Text>
              <DateField value={scadenza} onChange={setScadenza} style={styles.dateField} />
              <Text style={styles.fieldLabel}>Causale</Text>
              <TextInput value={causale} onChangeText={setCausale} style={styles.input} placeholder="Causale" />
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
            <Pressable
              style={({ pressed }) => [styles.card, !isCoach && item.stato !== 'Pagato' && styles.cardPayable, pressed && !isCoach && item.stato !== 'Pagato' && { opacity: 0.85 }]}
              onPress={!isCoach && item.stato !== 'Pagato' ? () => setPayModal(item) : undefined}
              disabled={isCoach || item.stato === 'Pagato'}
            >
              <View style={{ flex: 1 }}>
                <Text style={typography.h3}>€{Number(item.importo).toFixed(2)}</Text>
                <Text style={typography.caption}>{item.causale || 'Pagamento'}{methodLabel(item)}</Text>
                {!!item.scadenza && <Text style={typography.caption}>Scadenza: {String(item.scadenza).slice(0, 10).split('-').reverse().join('/')}</Text>}
                {!isCoach && item.stato !== 'Pagato' && <Text style={styles.payHint}>{item.stato === 'In verifica' ? 'Bonifico in verifica · tocca per i dettagli' : 'Tocca per pagare'}</Text>}
              </View>
              <View style={[styles.statusPill, { backgroundColor: (STATO_COLORS[item.stato] || colors.textMuted) + '1A' }]}>
                <Text style={{ color: STATO_COLORS[item.stato] || colors.textMuted, fontWeight: '700', fontSize: 12 }}>{item.stato}</Text>
              </View>
              {isCoach && item.stato !== 'Pagato' && item.stato !== 'In verifica' && (
                <Pressable onPress={() => markPaid(item)} style={styles.markPaidBtn}>
                  <Text style={styles.markPaidText}>✓</Text>
                </Pressable>
              )}
              {isCoach && item.stato === 'In verifica' && (
                <View style={{ width: '100%' }}><TransferActions item={item} /></View>
              )}
            </Pressable>
          )}
        />
      )}

      {!isCoach && (
        <PayModal
          payment={payModal}
          athleteName={fullName(user || {})}
          onClose={() => setPayModal(null)}
          onDone={() => { setPayModal(null); load(); }}
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
            <TextInput value={importo} onChangeText={setImporto} keyboardType="numeric" style={styles.input} placeholder="Importo" />
            <Text style={styles.fieldLabel}>Scadenza (YYYY-MM-DD)</Text>
            <DateField value={scadenza} onChange={setScadenza} style={styles.dateField} />
            <Text style={styles.fieldLabel}>Causale</Text>
            <TextInput value={causale} onChangeText={setCausale} style={styles.input} placeholder="Causale" />
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
  cardWrap: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  transferBox: { marginTop: spacing.sm, backgroundColor: '#EFF6FF', borderRadius: radius.md, padding: spacing.sm },
  transferText: { fontSize: 13, color: '#1E3A8A', fontWeight: '600' },
  transferActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  transferOk: { flex: 1, backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  transferOkText: { color: '#fff', fontWeight: '800' },
  transferNo: { flex: 1, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: colors.surface },
  transferNoText: { color: colors.danger, fontWeight: '800' },
  card: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
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
  summary: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  summaryBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  summaryLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterTextActive: { color: '#fff' },
  athleteName: { fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
  athleteChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  cardPayable: { borderColor: colors.primary },
  payHint: { fontSize: 12, fontWeight: '800', color: colors.primary, marginTop: 4 },
  payOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  payCard: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  payAmount: { fontSize: 30, fontWeight: '900', color: colors.text, textAlign: 'center' },
  payReason: { ...typography.caption, textAlign: 'center', marginTop: 2 },
  payInfo: { marginTop: spacing.sm, color: '#1D4ED8', backgroundColor: '#EFF6FF', borderRadius: radius.md, padding: spacing.sm, fontSize: 13, textAlign: 'center' },
  payBlock: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.bg },
  payBlockTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  payLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.sm },
  payValue: { fontSize: 14, color: colors.text, marginTop: 2 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  iban: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: 0.5, fontFamily: Platform.OS === 'web' ? 'ui-monospace, Menlo, Consolas, monospace' : undefined },
  copyBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  copyText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  payNote: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  payButtonSecondary: { marginTop: spacing.md, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  payButtonSecondaryText: { color: colors.primary, fontWeight: '800' },
  payOr: { textAlign: 'center', color: colors.textMuted, fontWeight: '700', marginVertical: spacing.md },
  payButton: { backgroundColor: '#635BFF', borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  payButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  payClose: { marginTop: spacing.lg, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  payCloseText: { color: colors.textMuted, fontWeight: '700' },
});
