import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateField from './DateField';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';
import { fullName } from '../utils/names';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtLong = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmt = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' });
export const mondayOf = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Assegna un allenamento (mode 'workout': piu' atleti x piu' date) o un piano (mode 'plan': piu' atleti + settimana di inizio).
export default function AssignModal({ visible, mode = 'workout', title, subtitle, onClose, onSubmit, defaultAthleteId }) {
  const { clients } = useAthlete();
  const { height } = useWindowDimensions();
  const [selected, setSelected] = useState([]);
  const [start, setStart] = useState(todayIso());
  const [repeat, setRepeat] = useState(false);
  const [until, setUntil] = useState(addDays(todayIso(), 28));
  const [extra, setExtra] = useState([]);
  const [extraDate, setExtraDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(defaultAthleteId ? [defaultAthleteId] : []);
    // piano: di default parte dal prossimo lunedi'
    setStart(mode === 'plan' ? addDays(mondayOf(todayIso()), 7) : todayIso());
    setRepeat(false);
    setUntil(addDays(todayIso(), 28));
    setExtra([]);
    setExtraDate('');
    setError(null);
  }, [visible, defaultAthleteId, mode]);

  const dates = useMemo(() => {
    if (mode !== 'workout' || !start) return [];
    const list = new Set([start]);
    if (repeat && until && until > start) {
      for (let day = addDays(start, 7), n = 0; day <= until && n < 60; day = addDays(day, 7), n += 1) list.add(day);
    }
    extra.forEach((day) => list.add(day));
    return [...list].sort();
  }, [mode, start, repeat, until, extra]);

  const toggle = (id) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const allSelected = clients.length > 0 && selected.length === clients.length;
  const total = mode === 'workout' ? selected.length * dates.length : selected.length;

  const submit = async () => {
    if (!selected.length) { setError('Scegli almeno un atleta'); return; }
    if (mode === 'workout' && !dates.length) { setError('Scegli almeno una data'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(mode === 'workout' ? { utenteIds: selected, dates } : { utenteIds: selected, startDate: start });
    } catch (e) {
      setError(e?.response?.data?.message || 'Assegnazione non riuscita');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { maxHeight: height - 40 }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={typography.h2} numberOfLines={1}>Assegna</Text>
              <Text style={styles.subtitle} numberOfLines={2}>{title}{subtitle ? ` · ${subtitle}` : ''}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={26} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={styles.rowBetween}>
              <Text style={styles.section}>Atleti ({selected.length})</Text>
              <Pressable onPress={() => setSelected(allSelected ? [] : clients.map((c) => c.utenteid))}>
                <Text style={styles.link}>{allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}</Text>
              </Pressable>
            </View>
            <View style={styles.athletes}>
              {clients.map((client) => {
                const active = selected.includes(client.utenteid);
                return (
                  <Pressable key={client.utenteid} onPress={() => toggle(client.utenteid)} style={[styles.athlete, active && styles.athleteActive]}>
                    <Ionicons name={active ? 'checkbox' : 'square-outline'} size={18} color={active ? colors.primary : colors.textMuted} />
                    <Text style={[styles.athleteText, active && { color: colors.primary }]} numberOfLines={1}>{fullName(client)}</Text>
                  </Pressable>
                );
              })}
              {!clients.length && <Text style={typography.caption}>Nessun atleta collegato.</Text>}
            </View>

            {mode === 'workout' ? (
              <>
                <Text style={styles.section}>Data</Text>
                <DateField value={start} onChange={setStart} />
                <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
                  <Text style={styles.label}>Ripeti ogni settimana</Text>
                  <Switch value={repeat} onValueChange={setRepeat} trackColor={{ true: colors.primary }} />
                </View>
                {repeat && (
                  <>
                    <Text style={styles.label}>Fino al</Text>
                    <DateField value={until} onChange={setUntil} />
                  </>
                )}
                <Text style={[styles.label, { marginTop: spacing.md }]}>Aggiungi altre date</Text>
                <View style={styles.addRow}>
                  <View style={{ flex: 1 }}><DateField value={extraDate} onChange={setExtraDate} /></View>
                  <Pressable style={styles.addBtn} onPress={() => { if (extraDate) { setExtra((current) => [...new Set([...current, extraDate])]); setExtraDate(''); } }}>
                    <Ionicons name="add" size={20} color="#fff" />
                  </Pressable>
                </View>
                <View style={styles.dates}>
                  {dates.map((day) => (
                    <Pressable key={day} style={styles.dateChip} onPress={() => (day === start ? null : setExtra((current) => current.filter((x) => x !== day)))}>
                      <Text style={styles.dateChipText}>{fmt(day)}</Text>
                      {extra.includes(day) && day !== start && <Ionicons name="close" size={12} color={colors.primary} />}
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.section}>Settimana di inizio</Text>
                <DateField value={start} onChange={setStart} />
                <Text style={styles.hint}>La settimana 1 del piano parte da {start ? fmtLong(mondayOf(start)) : '—'}{start && mondayOf(start) < todayIso() ? ' (già iniziata: gli allenamenti dei giorni passati finiranno nel passato)' : ''}.</Text>
              </>
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
          <Pressable style={[styles.submit, (saving || !total) && { opacity: 0.6 }]} onPress={submit} disabled={saving || !total}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.submitText}>
                {mode === 'workout'
                  ? `Assegna ${total ? `${total} allenament${total === 1 ? 'o' : 'i'}` : ''}`
                  : `Assegna piano${selected.length ? ` a ${selected.length} atlet${selected.length === 1 ? 'a' : 'i'}` : ''}`}
              </Text>
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
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  subtitle: { ...typography.caption, marginTop: 2 },
  section: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.md, marginBottom: spacing.xs },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  hint: { ...typography.caption, marginTop: spacing.xs },
  link: { color: colors.primary, fontWeight: '700', fontSize: 12, marginTop: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  athletes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  athlete: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7, maxWidth: '100%' },
  athleteActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  athleteText: { fontSize: 13, fontWeight: '700', color: colors.text },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  dateChipText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  error: { color: colors.danger, fontWeight: '700', marginTop: spacing.sm },
  submit: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
