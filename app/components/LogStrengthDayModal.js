import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import DateField from './DateField';
import { colors, spacing, radius, typography } from '../theme';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmt = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : null);

// L'atleta indica quale giorno della scheda ha fatto e in che data (anche fuori dall'ordine del coach).
// sheets: [{ nome, giorni: [{ schedaid, nome, ultima_volta }] }]
export default function LogStrengthDayModal({ visible, sheets = [], defaultSchedaId = null, onClose, onLogged }) {
  const [schedaId, setSchedaId] = useState(defaultSchedaId);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setSchedaId(defaultSchedaId || sheets[0]?.giorni?.[0]?.schedaid || null);
    setDate(todayIso());
    setError(null);
  }, [visible, defaultSchedaId, sheets]);

  const submit = async () => {
    if (!schedaId) { setError('Scegli il giorno della scheda'); return; }
    if (date > todayIso()) { setError('Puoi registrare solo oggi o i giorni passati'); return; }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post('/calendar/strength-sheets/log', { schedaid: schedaId, data: date });
      onLogged?.(data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Registrazione non riuscita');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={[typography.h2, { flex: 1 }]}>Ho fatto un allenamento</Text>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={26} color={colors.textMuted} /></Pressable>
          </View>
          <Text style={styles.hint}>Scegli il giorno della scheda e la data: se era in programma un altro giorno della settimana viene spostato qui.</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {sheets.map((sheet) => (
              <View key={sheet.nome}>
                {sheets.length > 1 && <Text style={styles.sheetName}>{sheet.nome}</Text>}
                <View style={styles.days}>
                  {sheet.giorni.map((day) => {
                    const active = day.schedaid === schedaId;
                    return (
                      <Pressable key={day.schedaid} onPress={() => setSchedaId(day.schedaid)} style={[styles.day, active && styles.dayActive]}>
                        <Text style={[styles.dayName, active && { color: '#fff' }]}>{day.nome}</Text>
                        <Text style={[styles.dayMeta, active && { color: '#fff' }]}>
                          {day.ultima_volta ? `ultima ${fmt(day.ultima_volta)}` : 'mai fatto'}
                          {day.esercizi?.length ? ` · ${day.esercizi.length} es.` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          <Text style={styles.label}>Quando</Text>
          <DateField value={date} onChange={setDate} />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={[styles.submit, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.submitText}>Registra e apri</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  card: { width: '100%', maxWidth: 640, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center' },
  hint: { ...typography.caption, marginTop: spacing.xs, marginBottom: spacing.md },
  sheetName: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: spacing.xs },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  day: { flexBasis: '47%', flexGrow: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayName: { fontSize: 15, fontWeight: '800', color: colors.text },
  dayMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  error: { color: colors.danger, fontWeight: '700', marginTop: spacing.sm },
  submit: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
