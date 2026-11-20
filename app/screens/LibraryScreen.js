import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert, Modal, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import AssignModal from '../components/AssignModal';
import ExercisesScreen from './ExercisesScreen';
import VideosScreen from './VideosScreen';
import { colors, spacing, radius, typography, workoutTypeColors } from '../theme';
import { formatHMS } from '../utils/dates';
import { sportInfo } from '../utils/endurance';

const SECTIONS = [
  { key: 'allenamenti', label: 'Allenamenti', icon: 'barbell' },
  { key: 'piani', label: 'Piani', icon: 'calendar' },
  { key: 'esercizi', label: 'Esercizi', icon: 'list' },
  { key: 'video', label: 'Video', icon: 'play-circle' },
];
const TYPES = [
  { key: 'all', label: 'Tutti' },
  { key: 'forza', label: 'Forza' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'funzionale', label: 'Funzionale' },
];
const NEW_OPTIONS = [
  { key: 'forza', label: 'Forza / pesistica', icon: 'barbell', color: workoutTypeColors.forza, screen: 'WorkoutEditor', params: { sport: 'forza' } },
  { key: 'funzionale', label: 'Funzionale', icon: 'flash', color: '#0EA5E9', screen: 'FunctionalWorkoutEditor', params: {} },
  { key: 'corsa', label: 'Corsa', icon: 'walk', color: '#f37021', screen: 'EnduranceWorkoutEditor', params: { sport: 'corsa' } },
  { key: 'ciclismo', label: 'Bici', icon: 'bicycle', color: '#1ab394', screen: 'EnduranceWorkoutEditor', params: { sport: 'ciclismo' } },
  { key: 'nuoto', label: 'Nuoto', icon: 'water', color: '#1c84c6', screen: 'EnduranceWorkoutEditor', params: { sport: 'nuoto' } },
];
const DAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

const templateSport = (template) => {
  if (template.sport) return template.sport;
  try { return JSON.parse(template.endurance_json || '{}')?.sport || null; } catch { return null; }
};
const typeLabel = (template) => {
  const sport = sportInfo(templateSport(template));
  if (template.tipo === 'endurance') return sport ? `${sport.icon} ${sport.label}` : 'Endurance';
  return { forza: '🏋️ Forza', funzionale: '⚡ Funzionale', mobilita: 'Mobilità', test: 'Test' }[template.tipo] || template.tipo;
};
const typeColor = (template) => sportInfo(templateSport(template))?.color || workoutTypeColors[template.tipo] || colors.primary;

// Libreria unica del coach: allenamenti standard, piani di piu' settimane, catalogo esercizi e video tutorial
export default function LibraryScreen({ navigation, route }) {
  const [section, setSection] = useState(route?.params?.section || 'allenamenti');
  // aperta dalla pagina di un atleta: l'assegnazione propone gia' quell'atleta
  const athleteId = route?.params?.athleteId || null;
  const athleteName = route?.params?.athleteName || null;
  const [templates, setTemplates] = useState([]);
  const [plans, setPlans] = useState([]);
  const [legacy, setLegacy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [assign, setAssign] = useState(null); // { mode, item }

  const load = useCallback(async () => {
    try {
      const [workouts, planList, legacyList] = await Promise.all([
        api.get('/workouts/templates/mine').then((r) => r.data || []).catch(() => []),
        api.get('/workouts/plans/mine').then((r) => r.data || []).catch(() => []),
        api.get('/endurance/templates/mine').then((r) => r.data || []).catch(() => []),
      ]);
      setTemplates(workouts);
      setPlans(planList);
      setLegacy(legacyList);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => (type === 'all' || (t.tipo || 'forza') === type) && (!q || String(t.nometemplate).toLowerCase().includes(q)));
  }, [templates, type, query]);

  const openEditor = (template) => {
    const screen = template.tipo === 'endurance' ? 'EnduranceWorkoutEditor' : template.tipo === 'funzionale' ? 'FunctionalWorkoutEditor' : 'WorkoutEditor';
    navigation.navigate(screen, { libraryTemplateId: template.templateid });
  };
  const removeTemplate = (template) => Alert.alert('Elimina allenamento', `Eliminare "${template.nometemplate}" dalla libreria? Verrà tolto anche dai piani che lo usano. Gli allenamenti già assegnati restano.`, [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: async () => { try { await api.delete(`/workouts/templates/${template.templateid}`); load(); } catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Impossibile eliminare'); } } },
  ]);
  const removePlan = (plan) => Alert.alert('Elimina piano', `Eliminare il piano "${plan.nome}"? Gli allenamenti restano in libreria.`, [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: async () => { try { await api.delete(`/workouts/plans/${plan.plan_id}`); load(); } catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Impossibile eliminare'); } } },
  ]);

  const submitAssign = async (body) => {
    const { mode, item } = assign;
    const { data } = mode === 'plan'
      ? await api.post(`/workouts/plans/${item.plan_id}/assign`, body)
      : await api.post(`/workouts/templates/${item.templateid}/assign-bulk`, body);
    setAssign(null);
    Alert.alert('Assegnato', data?.message || 'Fatto');
  };

  const renderTemplate = ({ item }) => {
    const seconds = item.durata_secondi ?? (item.durata_minuti ? item.durata_minuti * 60 : 0);
    return (
      <View style={[styles.card, { borderLeftColor: typeColor(item) }]}>
        <Text style={typography.h3}>{item.nometemplate}</Text>
        <Text style={styles.meta}>
          {typeLabel(item)}
          {seconds ? ` · ${formatHMS(seconds)}` : ''}
          {item.esercizi?.length ? ` · ${item.esercizi.length} esercizi` : ''}
          {item.rpe_pianificato ? ` · RPE ${item.rpe_pianificato}` : ''}
        </Text>
        {!!item.notegenerali && <Text style={styles.notes} numberOfLines={2}>{item.notegenerali}</Text>}
        <View style={styles.actions}>
          <Pressable style={styles.assignBtn} onPress={() => setAssign({ mode: 'workout', item })}>
            <Ionicons name="paper-plane-outline" size={15} color="#fff" />
            <Text style={styles.assignText}>Assegna</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => openEditor(item)} accessibilityLabel="Modifica">
            <Ionicons name="create-outline" size={18} color={colors.primary} />
          </Pressable>
          <Pressable style={[styles.iconBtn, { borderColor: '#FECACA' }]} onPress={() => removeTemplate(item)} accessibilityLabel="Elimina">
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderPlan = ({ item }) => {
    const byWeek = Array.from({ length: item.settimane }, (_, w) => DAYS.map((_, d) => item.items.filter((i) => i.settimana === w + 1 && i.giorno === d + 1)));
    return (
      <View style={[styles.card, { borderLeftColor: '#7C3AED' }]}>
        <Text style={typography.h3}>{item.nome}</Text>
        <Text style={styles.meta}>{item.settimane} settiman{item.settimane === 1 ? 'a' : 'e'} · {item.items.length} allenamenti</Text>
        {!!item.descrizione && <Text style={styles.notes} numberOfLines={2}>{item.descrizione}</Text>}
        <View style={styles.weeks}>
          {byWeek.slice(0, 6).map((week, w) => (
            <View key={w} style={styles.weekRow}>
              <Text style={styles.weekLabel}>S{w + 1}</Text>
              {week.map((items, d) => (
                <View key={d} style={[styles.dayCell, items.length > 0 && { backgroundColor: typeColor(items[0]) }]}>
                  <Text style={[styles.dayText, items.length > 0 && { color: '#fff' }]}>{items.length > 1 ? items.length : DAYS[d]}</Text>
                </View>
              ))}
            </View>
          ))}
          {item.settimane > 6 && <Text style={styles.meta}>… e altre {item.settimane - 6} settimane</Text>}
        </View>
        <View style={styles.actions}>
          <Pressable style={[styles.assignBtn, !item.items.length && { opacity: 0.5 }]} disabled={!item.items.length} onPress={() => setAssign({ mode: 'plan', item })}>
            <Ionicons name="paper-plane-outline" size={15} color="#fff" />
            <Text style={styles.assignText}>Assegna piano</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('PlanEditor', { planId: item.plan_id })} accessibilityLabel="Modifica">
            <Ionicons name="create-outline" size={18} color={colors.primary} />
          </Pressable>
          <Pressable style={[styles.iconBtn, { borderColor: '#FECACA' }]} onPress={() => removePlan(item)} accessibilityLabel="Elimina">
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.segments}>
        {SECTIONS.map((item) => (
          <Pressable key={item.key} onPress={() => setSection(item.key)} style={[styles.segment, section === item.key && styles.segmentActive]}>
            <Ionicons name={section === item.key ? item.icon : `${item.icon}-outline`} size={16} color={section === item.key ? colors.primary : colors.textMuted} />
            <Text style={[styles.segmentText, section === item.key && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {!!athleteId && (section === 'allenamenti' || section === 'piani') && (
        <View style={styles.athleteBar}>
          <Ionicons name="person" size={14} color={colors.primary} />
          <Text style={styles.athleteBarText} numberOfLines={1}>Assegni a {athleteName || 'questo atleta'} (puoi aggiungerne altri)</Text>
          <Pressable onPress={() => navigation.setParams({ athleteId: null, athleteName: null })} hitSlop={6}><Ionicons name="close" size={16} color={colors.primary} /></Pressable>
        </View>
      )}

      {section === 'esercizi' && <ExercisesScreen navigation={navigation} />}
      {section === 'video' && <VideosScreen navigation={navigation} />}

      {section === 'allenamenti' && (
        <>
          <View style={styles.toolbar}>
            <TextInput value={query} onChangeText={setQuery} placeholder="Cerca allenamento" style={styles.search} />
            <Pressable style={styles.newBtn} onPress={() => setNewOpen(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.newText}>Nuovo</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.chips}>
            {TYPES.map((item) => {
              const count = item.key === 'all' ? templates.length : templates.filter((t) => (t.tipo || 'forza') === item.key).length;
              return (
                <Pressable key={item.key} onPress={() => setType(item.key)} style={[styles.chip, type === item.key && styles.chipActive]}>
                  <Text style={[styles.chipText, type === item.key && styles.chipTextActive]}>{item.label} ({count})</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
            <FlatList
              data={filtered}
              keyExtractor={(t) => String(t.templateid)}
              renderItem={renderTemplate}
              contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
              ListEmptyComponent={<Text style={styles.empty}>Nessun allenamento. Tocca «Nuovo» per crearne uno, oppure da un allenamento del calendario scegli «Salva in libreria».</Text>}
            />
          )}
        </>
      )}

      {section === 'piani' && (
        loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
          <FlatList
            data={plans}
            keyExtractor={(p) => String(p.plan_id)}
            renderItem={renderPlan}
            contentContainerStyle={{ padding: spacing.lg }}
            ListHeaderComponent={(
              <View style={styles.planHeader}>
                <Text style={[typography.caption, { flex: 1 }]}>Più settimane di allenamenti della libreria, da assegnare in un colpo.</Text>
                <Pressable style={styles.newBtn} onPress={() => navigation.navigate('PlanEditor', {})}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.newText}>Nuovo piano</Text>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Nessun piano. Crea prima gli allenamenti in «Allenamenti», poi componi un piano a settimane.</Text>}
            ListFooterComponent={legacy.length > 0 ? (
              <View style={{ marginTop: spacing.xl }}>
                <Text style={styles.legacyTitle}>Template endurance precedenti</Text>
                {legacy.map((template) => (
                  <Pressable key={template.template_id} style={styles.legacyCard} onPress={() => navigation.navigate('TemplateDetail', { template })}>
                    <Text style={styles.legacyName}>{template.title}</Text>
                    <Text style={styles.meta}>{template.sessions?.length || 0} sessioni · sola lettura</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          />
        )
      )}

      <Modal visible={newOpen} transparent animationType="fade" onRequestClose={() => setNewOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setNewOpen(false)}>
          <View style={styles.newCard}>
            <Text style={typography.h2}>Nuovo allenamento</Text>
            <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Che tipo di allenamento vuoi salvare in libreria?</Text>
            {NEW_OPTIONS.map((option) => (
              <Pressable key={option.key} style={styles.newOption} onPress={() => { setNewOpen(false); navigation.navigate(option.screen, { ...option.params, libraryMode: true }); }}>
                <View style={[styles.newIcon, { backgroundColor: `${option.color}1A` }]}><Ionicons name={option.icon} size={20} color={option.color} /></View>
                <Text style={styles.newOptionText}>{option.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <AssignModal
        visible={!!assign}
        mode={assign?.mode === 'plan' ? 'plan' : 'workout'}
        title={assign?.mode === 'plan' ? assign?.item?.nome : assign?.item?.nometemplate}
        subtitle={assign?.mode === 'plan' ? `${assign?.item?.items?.length || 0} allenamenti in ${assign?.item?.settimane} settimane` : assign?.item ? typeLabel(assign.item) : ''}
        onClose={() => setAssign(null)}
        onSubmit={submitAssign}
        defaultAthleteId={athleteId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  segments: { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.sm },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  segmentActive: { borderBottomColor: colors.primary },
  segmentText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  segmentTextActive: { color: colors.primary },
  athleteBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.primaryLight, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  athleteBarText: { flex: 1, color: colors.primary, fontWeight: '700', fontSize: 13 },
  toolbar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  search: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, flexShrink: 0 },
  newText: { color: '#fff', fontWeight: '800' },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: '#fff' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  meta: { ...typography.caption, marginTop: 2 },
  notes: { ...typography.caption, marginTop: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  assignBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, flex: 1, justifyContent: 'center' },
  assignText: { color: '#fff', fontWeight: '800' },
  iconBtn: { width: 40, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  weeks: { marginTop: spacing.sm, gap: 3 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  weekLabel: { width: 24, fontSize: 10, fontWeight: '800', color: colors.textMuted },
  dayCell: { flex: 1, height: 18, borderRadius: 3, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 9, fontWeight: '800', color: colors.textMuted },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  legacyTitle: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  legacyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, opacity: 0.85 },
  legacyName: { fontSize: 15, fontWeight: '700', color: colors.text },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg, alignItems: 'center' },
  newCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  newOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  newIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  newOptionText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
});
