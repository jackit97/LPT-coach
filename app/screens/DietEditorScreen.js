import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import api from '../api/client';
import { colors, spacing, radius, typography } from '../theme';

export default function DietEditorScreen({ route, navigation }) {
  const existing = route.params?.diet || null;
  const isEdit = !!existing;

  const [nome, setNome] = useState(existing?.nome || '');
  const [datainizio, setDatainizio] = useState(existing?.datainizio ? String(existing.datainizio).slice(0, 10) : '');
  const [datafine, setDatafine] = useState(existing?.datafine ? String(existing.datafine).slice(0, 10) : '');
  const [macrototali, setMacrototali] = useState(existing?.macrototali || '');
  const [notegenerali, setNotegenerali] = useState(existing?.notegenerali || '');
  const [pasti, setPasti] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api.get(`/diets/${existing.dietaid}`).then(({ data }) => setPasti((data.pasti || []).map((p) => ({ ...p }))));
    }
  }, [isEdit]);

  const addMeal = () => setPasti((prev) => [...prev, { tipopasto: '', descrizione: '' }]);
  const updateMeal = (idx, field, value) => setPasti((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  const removeMeal = (idx) => setPasti((prev) => prev.filter((_, i) => i !== idx));

  const onSave = async () => {
    if (!nome) return Alert.alert('Errore', 'Il nome della dieta e richiesto');
    setSaving(true);
    try {
      const payload = { nome, datainizio: datainizio || null, datafine: datafine || null, macrototali, notegenerali };
      let dietId = existing?.dietaid;
      if (isEdit) {
        await api.put(`/diets/${dietId}`, payload);
        await api.put(`/diets/${dietId}/meals`, { pasti });
      } else {
        const { data: created } = await api.post('/diets', { ...payload, utenteId: route.params?.utenteId, pasti });
        dietId = created.dietaid;
      }
      navigation.replace('DietDetail', { dietId });
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile salvare la dieta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h1}>{isEdit ? 'Modifica dieta' : 'Nuova dieta'}</Text>

      <Text style={styles.fieldLabel}>Nome</Text>
      <TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Dieta definizione" />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Inizio</Text>
          <TextInput value={datainizio} onChangeText={setDatainizio} style={styles.input} placeholder="2026-09-01" />
        </View>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Fine</Text>
          <TextInput value={datafine} onChangeText={setDatafine} style={styles.input} placeholder="2026-09-30" />
        </View>
      </View>

      <Text style={styles.fieldLabel}>Macro totali</Text>
      <TextInput value={macrototali} onChangeText={setMacrototali} style={styles.input} placeholder="Kcal:2200 P:160 C:240 F:70" />

      <Text style={styles.fieldLabel}>Note generali</Text>
      <TextInput value={notegenerali} onChangeText={setNotegenerali} style={[styles.input, styles.textArea]} multiline />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={typography.h3}>Pasti</Text>
          <Pressable onPress={addMeal}><Text style={styles.addLink}>+ Aggiungi</Text></Pressable>
        </View>
        {pasti.map((pasto, idx) => (
          <View key={idx} style={styles.mealCard}>
            <View style={styles.mealCardHeader}>
              <TextInput value={pasto.tipopasto} onChangeText={(v) => updateMeal(idx, 'tipopasto', v)} placeholder="Colazione" style={[styles.input, { flex: 1 }]} />
              <Pressable onPress={() => removeMeal(idx)} style={styles.removeBtn}><Text style={styles.removeBtnText}>✕</Text></Pressable>
            </View>
            <TextInput value={pasto.descrizione} onChangeText={(v) => updateMeal(idx, 'descrizione', v)} placeholder="Descrizione" style={styles.input} />
          </View>
        ))}
      </View>

      <Pressable style={styles.primaryButton} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>{isEdit ? 'Salva modifiche' : 'Crea dieta'}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  section: { marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addLink: { color: colors.accent, fontWeight: '700' },
  mealCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  mealCardHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  removeBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.danger, fontWeight: '700' },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xxl },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
});
