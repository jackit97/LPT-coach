import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { colors, spacing, radius, typography } from '../theme';

export default function TemplatesScreen({ navigation }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [exercise, setExercise] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/endurance/templates/mine'); setTemplates(data || []); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!name.trim()) return Alert.alert('Errore', 'Inserisci il nome del template');
    setSaving(true);
    try {
      await api.post('/endurance/templates', {
        title: name.trim(), block: 'base', weeks: 4, notes: notes || null,
        sessions: exercise ? exercise.split(',').map((item) => ({ title: item.trim(), durationMinutes: 45 })).filter((item) => item.title) : [],
      });
      setOpen(false); setName(''); setNotes(''); setExercise(''); await load();
    } catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Impossibile creare il template'); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.screen}>
      {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
        <FlatList
          data={templates}
          keyExtractor={(item) => String(item.template_id)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListHeaderComponent={<Text style={styles.heading}>Template endurance</Text>}
          ListEmptyComponent={<Text style={styles.empty}>Nessun template creato.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate('TemplateDetail', { template: item })}>
              <Text style={typography.h3}>{item.title}</Text>
              <Text style={typography.caption}>{item.sessions?.length || 0} sessioni di allenamento</Text>
              {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}
            </Pressable>
          )}
        />
      )}
      <Pressable style={styles.fab} onPress={() => setOpen(true)}><Text style={styles.fabText}>+</Text></Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}><View style={styles.modal}>
          <Text style={typography.h2}>Nuovo template endurance</Text>
          <Text style={styles.label}>Titolo</Text><TextInput value={name} onChangeText={setName} style={styles.input} placeholder="HYROX base" />
          <Text style={styles.label}>Note</Text><TextInput value={notes} onChangeText={setNotes} style={styles.input} placeholder="Indicazioni generali" />
          <Text style={styles.label}>Sessioni separate da virgola</Text><TextInput value={exercise} onChangeText={setExercise} style={styles.input} placeholder="Corsa Z2, Ripetute Z4, Lungo" />
          <View style={styles.actions}><Pressable style={styles.secondary} onPress={() => setOpen(false)}><Text>Annulla</Text></Pressable><Pressable style={styles.primary} onPress={create} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Crea</Text>}</Pressable></View>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, heading: { ...typography.h2, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  notes: { ...typography.caption, marginTop: spacing.xs }, empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, fabText: { color: '#fff', fontSize: 28 },
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }, modal: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surfaceAlt }, actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }, secondary: { flex: 1, alignItems: 'center', padding: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md }, primary: { flex: 1, alignItems: 'center', padding: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md }, primaryText: { color: '#fff', fontWeight: '700' },
});