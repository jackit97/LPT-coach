import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function EndurancePlanDetailScreen({ route }) {
  const { planId } = route.params;
  const { isCoach } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sTitle, setSTitle] = useState('');
  const [sDate, setSDate] = useState('');
  const [sZone, setSZone] = useState('Z2');
  const [sDuration, setSDuration] = useState('45');
  const [saving, setSaving] = useState(false);

  const [checkinModalOpen, setCheckinModalOpen] = useState(false);
  const [checkinSessionId, setCheckinSessionId] = useState(null);
  const [rpe, setRpe] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/endurance/plans/${planId}`);
      setPlan(data);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addSession = async () => {
    if (!sTitle || !sDuration) return Alert.alert('Errore', 'Titolo e durata sono richiesti');
    setSaving(true);
    try {
      await api.post(`/endurance/plans/${planId}/sessions`, {
        title: sTitle, date: sDate || null, zone: sZone, durationMinutes: Number(sDuration),
      });
      setSessionModalOpen(false);
      setSTitle(''); setSDate('');
      await load();
    } catch (e) {
      Alert.alert('Errore', 'Impossibile aggiungere la sessione');
    } finally {
      setSaving(false);
    }
  };

  const openCheckin = (session) => { setCheckinSessionId(session.session_id); setCheckinModalOpen(true); };

  const submitCheckin = async () => {
    setSaving(true);
    try {
      await api.post(`/endurance/sessions/${checkinSessionId}/checkin`, {
        completed: true, rpe: rpe ? Number(rpe) : null, distanceKm: distanceKm ? Number(distanceKm) : null, notes,
      });
      setCheckinModalOpen(false);
      setRpe(''); setDistanceKm(''); setNotes('');
      Alert.alert('Fatto', 'Check-in registrato');
    } catch (e) {
      Alert.alert('Errore', 'Impossibile registrare il check-in');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !plan) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h1}>{plan.title}</Text>
      <Text style={typography.caption}>{plan.block} · {plan.weeks} settimane</Text>
      {!!plan.notes && <Text style={styles.paragraph}>{plan.notes}</Text>}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={typography.h3}>Sessioni</Text>
          {isCoach && <Pressable onPress={() => setSessionModalOpen(true)}><Text style={styles.addLink}>+ Aggiungi</Text></Pressable>}
        </View>
        {(plan.sessions || []).map((session) => (
          <View key={session.session_id} style={styles.sessionCard}>
            <Text style={typography.h3}>{session.title}</Text>
            <Text style={typography.caption}>
              {session.date ? String(session.date).slice(0, 10) : 'senza data'} · {session.zone || '—'} · {session.duration_minutes} min
            </Text>
            {!isCoach && (
              <Pressable style={styles.checkinBtn} onPress={() => openCheckin(session)}>
                <Text style={styles.checkinBtnText}>Registra check-in</Text>
              </Pressable>
            )}
          </View>
        ))}
        {!plan.sessions?.length && <Text style={typography.caption}>Nessuna sessione ancora.</Text>}
      </View>

      <Modal visible={sessionModalOpen} transparent animationType="slide" onRequestClose={() => setSessionModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>Nuova sessione</Text>
            <Text style={styles.fieldLabel}>Titolo</Text>
            <TextInput value={sTitle} onChangeText={setSTitle} style={styles.input} placeholder="Corsa lenta" />
            <Text style={styles.fieldLabel}>Data (YYYY-MM-DD)</Text>
            <TextInput value={sDate} onChangeText={setSDate} style={styles.input} placeholder="2026-09-05" />
            <Text style={styles.fieldLabel}>Zona</Text>
            <TextInput value={sZone} onChangeText={setSZone} style={styles.input} placeholder="Z2" />
            <Text style={styles.fieldLabel}>Durata (min)</Text>
            <TextInput value={sDuration} onChangeText={setSDuration} keyboardType="numeric" style={styles.input} />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setSessionModalOpen(false)}><Text style={styles.secondaryButtonText}>Annulla</Text></Pressable>
              <Pressable style={styles.primaryButton} onPress={addSession} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Aggiungi</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={checkinModalOpen} transparent animationType="slide" onRequestClose={() => setCheckinModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>Check-in sessione</Text>
            <Text style={styles.fieldLabel}>RPE</Text>
            <TextInput value={rpe} onChangeText={setRpe} keyboardType="numeric" style={styles.input} placeholder="6" />
            <Text style={styles.fieldLabel}>Distanza (km)</Text>
            <TextInput value={distanceKm} onChangeText={setDistanceKm} keyboardType="numeric" style={styles.input} placeholder="8.2" />
            <Text style={styles.fieldLabel}>Note</Text>
            <TextInput value={notes} onChangeText={setNotes} style={[styles.input, styles.textArea]} multiline />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setCheckinModalOpen(false)}><Text style={styles.secondaryButtonText}>Annulla</Text></Pressable>
              <Pressable style={styles.primaryButton} onPress={submitCheckin} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Salva</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  paragraph: { ...typography.body, marginTop: spacing.sm, lineHeight: 20 },
  section: { marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addLink: { color: colors.accent, fontWeight: '700' },
  sessionCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  checkinBtn: { marginTop: spacing.sm, alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  checkinBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flex: 1 },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  secondaryButton: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flex: 1 },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
});
