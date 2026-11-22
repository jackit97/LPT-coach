import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { colors, spacing, radius, typography, workoutTypeColors } from '../theme';
import { sportInfo } from '../utils/endurance';

const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const sportOf = (template) => {
  if (template.sport) return template.sport;
  try { return JSON.parse(template.endurance_json || '{}')?.sport || null; } catch { return null; }
};
const colorOf = (template) => sportInfo(sportOf(template))?.color || workoutTypeColors[template.tipo] || colors.primary;

// Editor di un piano della libreria: per ogni settimana e giorno si scelgono gli allenamenti della libreria
export default function PlanEditorScreen({ route, navigation }) {
  const planId = route.params?.planId || null;
  const [nome, setNome] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(null); // { settimana, giorno }
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [{ data: list }, plan] = await Promise.all([
          api.get('/workouts/templates/mine'),
          planId ? api.get(`/workouts/plans/${planId}`).then((r) => r.data) : Promise.resolve(null),
        ]);
        setTemplates(list || []);
        if (plan) {
          setNome(plan.nome);
          setDescrizione(plan.descrizione || '');
          setWeeks(plan.settimane);
          setItems(plan.items.map((item) => ({ ...item, key: `${item.item_id}` })));
        }
      } catch (e) {
        Alert.alert('Errore', e?.response?.data?.message || 'Impossibile caricare il piano');
      } finally {
        setLoading(false);
      }
    })();
  }, [planId]);

  // tornando dall'editor dell'allenamento: nomi e tipi aggiornati
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focusedOnce.current) api.get('/workouts/templates/mine').then(({ data }) => setTemplates(data || [])).catch(() => {});
    focusedOnce.current = true;
  }, []));
  const [itemMenu, setItemMenu] = useState(null); // elemento del piano toccato
  const [busy, setBusy] = useState(false);
  const editorFor = (template) => (template?.tipo === 'endurance' ? 'EnduranceWorkoutEditor' : template?.tipo === 'funzionale' ? 'FunctionalWorkoutEditor' : 'WorkoutEditor');
  const editTemplate = (item) => {
    const template = byTemplate.get(item.templateid) || item;
    setItemMenu(null);
    navigation.navigate(editorFor(template), { libraryTemplateId: item.templateid });
  };
  // copia dell'allenamento usata solo in questo giorno del piano, poi apre l'editor sulla copia
  const editCopy = async (item) => {
    setBusy(true);
    try {
      const template = byTemplate.get(item.templateid) || item;
      const { data: copy } = await api.post(`/workouts/templates/${item.templateid}/duplicate`, { nomeTemplate: `${template.nometemplate} · S${item.settimana}` });
      setTemplates((current) => [copy, ...current]);
      setItems((current) => current.map((row) => (row.key === item.key ? { ...row, templateid: copy.templateid, nometemplate: copy.nometemplate } : row)));
      setItemMenu(null);
      navigation.navigate(editorFor(copy), { libraryTemplateId: copy.templateid });
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile creare la copia');
    } finally {
      setBusy(false);
    }
  };

  const byTemplate = useMemo(() => new Map(templates.map((t) => [t.templateid, t])), [templates]);
  const pickable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => !q || String(t.nometemplate).toLowerCase().includes(q));
  }, [templates, query]);

  const addItem = (template) => {
    setItems((current) => [...current, { key: `n${Date.now()}${Math.random()}`, templateid: template.templateid, settimana: picker.settimana, giorno: picker.giorno, nometemplate: template.nometemplate, tipo: template.tipo, sport: sportOf(template) }]);
    setPicker(null);
    setQuery('');
  };
  const removeItem = (key) => setItems((current) => current.filter((item) => item.key !== key));
  const copyPreviousWeek = (week) => {
    const previous = items.filter((item) => item.settimana === week - 1);
    if (!previous.length) return;
    setItems((current) => [
      ...current.filter((item) => item.settimana !== week),
      ...previous.map((item) => ({ ...item, key: `c${week}-${item.key}-${Math.random()}`, settimana: week })),
    ]);
  };
  const changeWeeks = (value) => {
    const next = Math.min(52, Math.max(1, value));
    if (next < weeks && items.some((item) => item.settimana > next)) {
      Alert.alert('Ridurre le settimane?', `Gli allenamenti dalla settimana ${next + 1} in poi verranno tolti dal piano.`, [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Riduci', style: 'destructive', onPress: () => { setWeeks(next); setItems((current) => current.filter((item) => item.settimana <= next)); } },
      ]);
      return;
    }
    setWeeks(next);
  };

  const save = async () => {
    if (!nome.trim()) return Alert.alert('Errore', 'Dai un nome al piano');
    setSaving(true);
    try {
      const payload = { nome: nome.trim(), descrizione: descrizione || null, settimane: weeks, items: items.map(({ templateid, settimana, giorno }) => ({ templateid, settimana, giorno })) };
      if (planId) await api.put(`/workouts/plans/${planId}`, payload);
      else await api.post('/workouts/plans', payload);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile salvare il piano');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        <Text style={typography.h1}>{planId ? 'Modifica piano' : 'Nuovo piano'}</Text>
        <Text style={styles.label}>Nome</Text>
        <TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Nome del piano" />
        <Text style={styles.label}>Descrizione</Text>
        <TextInput value={descrizione} onChangeText={setDescrizione} style={[styles.input, { minHeight: 60 }]} multiline placeholder="Obiettivo, a chi è adatto…" />
        <View style={styles.weeksRow}>
          <Text style={[styles.label, { marginTop: 0, flex: 1 }]}>Settimane</Text>
          <Pressable style={styles.stepBtn} onPress={() => changeWeeks(weeks - 1)}><Ionicons name="remove" size={18} color={colors.primary} /></Pressable>
          <Text style={styles.weeksValue}>{weeks}</Text>
          <Pressable style={styles.stepBtn} onPress={() => changeWeeks(weeks + 1)}><Ionicons name="add" size={18} color={colors.primary} /></Pressable>
        </View>
        {!templates.length && <Text style={styles.warning}>La libreria è vuota: crea prima qualche allenamento nella sezione «Allenamenti».</Text>}

        {Array.from({ length: weeks }, (_, w) => w + 1).map((week) => {
          const weekItems = items.filter((item) => item.settimana === week);
          return (
            <View key={week} style={styles.weekCard}>
              <View style={styles.weekHeader}>
                <Text style={styles.weekTitle}>Settimana {week}</Text>
                <Text style={styles.weekCount}>{weekItems.length} allenament{weekItems.length === 1 ? 'o' : 'i'}</Text>
                {week > 1 && (
                  <Pressable onPress={() => copyPreviousWeek(week)} hitSlop={6}>
                    <Text style={styles.copyLink}>Copia sett. {week - 1}</Text>
                  </Pressable>
                )}
              </View>
              {DAY_NAMES.map((day, d) => {
                const dayItems = weekItems.filter((item) => item.giorno === d + 1);
                return (
                  <View key={day} style={styles.dayRow}>
                    <Text style={styles.dayName}>{day.slice(0, 3)}</Text>
                    <View style={styles.dayItems}>
                      {dayItems.map((item) => {
                        const template = byTemplate.get(item.templateid) || item;
                        return (
                          <View key={item.key} style={[styles.itemChip, { borderColor: colorOf(template), backgroundColor: `${colorOf(template)}14` }]}>
                            <Pressable onPress={() => setItemMenu(item)} style={{ flexShrink: 1 }} accessibilityLabel={`Apri ${template.nometemplate}`}>
                              <Text style={[styles.itemText, { color: colorOf(template) }]} numberOfLines={1}>{template.nometemplate} ✎</Text>
                            </Pressable>
                            <Pressable onPress={() => removeItem(item.key)} hitSlop={6}><Ionicons name="close" size={14} color={colorOf(template)} /></Pressable>
                          </View>
                        );
                      })}
                      <Pressable style={styles.addChip} onPress={() => setPicker({ settimana: week, giorno: d + 1 })} disabled={!templates.length}>
                        <Ionicons name="add" size={14} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.cancel} onPress={() => navigation.goBack()}><Text style={styles.cancelText}>Annulla</Text></Pressable>
        <Pressable style={styles.save} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salva piano</Text>}
        </Pressable>
      </View>

      <Modal visible={!!itemMenu} transparent animationType="fade" onRequestClose={() => setItemMenu(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setItemMenu(null)}>
          <View style={styles.menuCard}>
            {itemMenu && (
              <>
                <Text style={typography.h3} numberOfLines={2}>{(byTemplate.get(itemMenu.templateid) || itemMenu).nometemplate}</Text>
                <Text style={[typography.caption, { marginBottom: spacing.sm }]}>Settimana {itemMenu.settimana} · {DAY_NAMES[itemMenu.giorno - 1]}</Text>
                <Pressable style={styles.menuRow} onPress={() => editTemplate(itemMenu)}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuTitle}>Modifica allenamento</Text>
                    <Text style={styles.menuHint}>Cambia l'allenamento in libreria: vale per tutti i piani che lo usano</Text>
                  </View>
                </Pressable>
                <Pressable style={styles.menuRow} onPress={() => editCopy(itemMenu)} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="copy-outline" size={20} color={colors.primary} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuTitle}>Modifica solo in questo giorno</Text>
                    <Text style={styles.menuHint}>Crea una copia (es. carichi più alti in settimana {itemMenu.settimana}) e la modifica</Text>
                  </View>
                </Pressable>
                <Pressable style={styles.menuRow} onPress={() => { removeItem(itemMenu.key); setItemMenu(null); }}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  <View style={{ flex: 1 }}><Text style={[styles.menuTitle, { color: colors.danger }]}>Togli da questo giorno</Text></View>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!picker} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
          <View style={styles.pickerCard}>
            <Text style={typography.h2}>{picker ? `Settimana ${picker.settimana} · ${DAY_NAMES[picker.giorno - 1]}` : ''}</Text>
            <TextInput value={query} onChangeText={setQuery} placeholder="Cerca allenamento" style={[styles.input, { marginTop: spacing.sm }]} />
            <FlatList
              data={pickable}
              keyExtractor={(t) => String(t.templateid)}
              style={{ maxHeight: 380, marginTop: spacing.sm }}
              renderItem={({ item }) => (
                <Pressable style={styles.pickRow} onPress={() => addItem(item)}>
                  <View style={[styles.pickDot, { backgroundColor: colorOf(item) }]} />
                  <Text style={styles.pickName} numberOfLines={1}>{item.nometemplate}</Text>
                  <Ionicons name="add-circle" size={22} color={colors.primary} />
                </Pressable>
              )}
              ListEmptyComponent={<Text style={typography.caption}>Nessun allenamento trovato.</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface, textAlignVertical: 'top' },
  weeksRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  weeksValue: { fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center', color: colors.text },
  warning: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FEF3C7', color: '#92400E', fontWeight: '600' },
  weekCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  weekHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  weekTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  weekCount: { flex: 1, ...typography.caption },
  copyLink: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  dayRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#f1f3f7' },
  dayName: { width: 40, fontSize: 12, fontWeight: '800', color: colors.textMuted, paddingTop: 4 },
  dayItems: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  itemChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%' },
  itemText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  addChip: { width: 28, height: 24, borderRadius: radius.pill, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  cancel: { flex: 1, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  cancelText: { fontWeight: '700', color: colors.text },
  save: { flex: 2, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary },
  saveText: { color: '#fff', fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  pickerCard: { width: '100%', maxWidth: 640, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  menuCard: { width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  menuTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  menuHint: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickDot: { width: 10, height: 10, borderRadius: 5 },
  pickName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
});
