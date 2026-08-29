import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';

export default function EnduranceScreen({ navigation }) {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [block, setBlock] = useState('base');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [weeks, setWeeks] = useState('4');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!targetUserId) { setPlans([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/endurance/plans', { params: { utenteId: targetUserId } });
      setPlans(data || []);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createPlan = async () => {
    if (!title || !startDate || !endDate) return Alert.alert('Errore', 'Titolo e date sono richiesti');
    setSaving(true);
    try {
      await api.post('/endurance/plans', { utenteId: targetUserId, title, block, startDate, endDate, weeks: Number(weeks) });
      setModalOpen(false);
      setTitle(''); setStartDate(''); setEndDate('');
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile creare il piano');
    } finally {
      setSaving(false);
    }
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
          data={plans}
          keyExtractor={(item) => String(item.plan_id)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<Text style={styles.empty}>Nessun piano endurance ancora.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate('EndurancePlanDetail', { planId: item.plan_id })}>
              <Text style={typography.h3}>{item.title}</Text>
              <Text style={typography.caption}>
                {item.block} · {item.weeks} settimane · {String(item.start_date).slice(0, 10)} → {String(item.end_date).slice(0, 10)}
              </Text>
            </Pressable>
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
            <Text style={typography.h2}>Nuovo piano endurance</Text>
            <Text style={styles.fieldLabel}>Titolo</Text>
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Piano 10K" />
            <Text style={styles.fieldLabel}>Blocco</Text>
            <TextInput value={block} onChangeText={setBlock} style={styles.input} placeholder="base" />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Inizio</Text>
                <TextInput value={startDate} onChangeText={setStartDate} style={styles.input} placeholder="2026-09-01" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Fine</Text>
                <TextInput value={endDate} onChangeText={setEndDate} style={styles.input} placeholder="2026-09-28" />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Settimane</Text>
            <TextInput value={weeks} onChangeText={setWeeks} keyboardType="numeric" style={styles.input} />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setModalOpen(false)}>
                <Text style={styles.secondaryButtonText}>Annulla</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={createPlan} disabled={saving}>
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
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
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
  row: { flexDirection: 'row', gap: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
});
