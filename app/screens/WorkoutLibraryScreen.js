import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { colors, spacing, radius, typography, workoutTypeColors } from '../theme';
import { formatHMS } from '../utils/dates';

const SPORTS = [
  { key: 'all', label: 'Tutti gli sport' },
  { key: 'forza', label: 'Forza' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'funzionale', label: 'Funzionale' },
  { key: 'mobilita', label: 'Mobilità' },
  { key: 'test', label: 'Test' },
];

export default function WorkoutLibraryScreen({ route, navigation }) {
  const date = route?.params?.date;
  const utenteId = route?.params?.utenteId;
  const pickMode = !!(date && utenteId);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/workouts/templates/mine');
      setTemplates(data || []);
    } catch (e) {
      Alert.alert('Errore', 'Impossibile caricare la libreria');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => {
    const map = { all: templates.length };
    templates.forEach((t) => { map[t.tipo || 'forza'] = (map[t.tipo || 'forza'] || 0) + 1; });
    return map;
  }, [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => (sport === 'all' || (t.tipo || 'forza') === sport)
      && (!q || String(t.nometemplate).toLowerCase().includes(q)));
  }, [templates, sport, query]);

  const assign = async (template) => {
    setBusyId(template.templateid);
    try {
      await api.post(`/workouts/templates/${template.templateid}/assign`, { utenteId, data: date });
      navigation.navigate('Calendar');
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile assegnare l\'allenamento');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (template) => {
    if (confirmDelete !== template.templateid) { setConfirmDelete(template.templateid); return; }
    try {
      await api.delete(`/workouts/templates/${template.templateid}`);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile eliminare');
    }
  };

  const renderItem = ({ item }) => {
    const type = item.tipo || 'forza';
    const color = workoutTypeColors[type] || colors.primary;
    const seconds = item.durata_secondi ?? (item.durata_minuti ? item.durata_minuti * 60 : 0);
    return (
      <Pressable style={[styles.card, { borderLeftColor: color }]} onPress={pickMode ? () => assign(item) : undefined} disabled={busyId === item.templateid}>
        <View style={{ flex: 1 }}>
          <Text style={typography.h3}>{item.nometemplate}</Text>
          <Text style={typography.caption}>
            {SPORTS.find((s) => s.key === type)?.label || type}
            {seconds ? ` · ${formatHMS(seconds)}` : ''}
            {item.esercizi?.length ? ` · ${item.esercizi.length} esercizi` : ''}
          </Text>
          {!!item.notegenerali && <Text style={styles.notes} numberOfLines={2}>{item.notegenerali}</Text>}
        </View>
        {busyId === item.templateid
          ? <ActivityIndicator color={colors.primary} />
          : pickMode
            ? <Text style={styles.assignText}>Assegna</Text>
            : (
              <Pressable onPress={() => remove(item)} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>{confirmDelete === item.templateid ? 'Conferma' : 'Elimina'}</Text>
              </Pressable>
            )}
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      {pickMode && <Text style={styles.pickBanner}>Seleziona un allenamento da assegnare al {date}</Text>}
      <TextInput value={query} onChangeText={setQuery} placeholder="Cerca allenamento" style={styles.search} />
      <FlatList
        horizontal
        data={SPORTS}
        keyExtractor={(s) => s.key}
        style={styles.chipsList}
        contentContainerStyle={styles.chips}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSport(item.key)} style={[styles.chip, sport === item.key && styles.chipActive]}>
            <Text style={[styles.chipText, sport === item.key && styles.chipTextActive]}>{item.label} ({counts[item.key] || 0})</Text>
          </Pressable>
        )}
      />
      {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => String(t.templateid)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<Text style={styles.empty}>Nessun allenamento in libreria. Apri un allenamento dal calendario e scegli "Salva in libreria".</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pickBanner: { backgroundColor: colors.primaryLight, color: colors.primary, fontWeight: '700', padding: spacing.md },
  search: { margin: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface },
  chipsList: { flexGrow: 0 },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.textInverse },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  notes: { ...typography.caption, marginTop: spacing.xs },
  assignText: { color: colors.primary, fontWeight: '700' },
  deleteBtn: { backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  deleteText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
});
