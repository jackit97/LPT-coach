import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function DietDetailScreen({ route, navigation }) {
  const { dietId } = route.params;
  const { isCoach } = useAuth();
  const [diet, setDiet] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/diets/${dietId}`);
      setDiet(data);
    } finally {
      setLoading(false);
    }
  }, [dietId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const downloadPdf = () => {
    if (typeof window === 'undefined' || !window.open) return Alert.alert('PDF', 'L\'esportazione PDF è disponibile dalla versione web.');
    const days = ['Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato', 'Domenica'];
    const rows = days.map((day) => `<tr><th>${day}</th>${(diet.pasti || []).filter((meal) => (meal.giorno_settimana || 'Lunedi') === day).map((meal) => `<td><strong>${meal.tipopasto || ''}</strong><br>${meal.descrizione || ''}</td>`).join('') || '<td></td>'}</tr>`).join('');
    const popup = window.open('', '_blank');
    if (!popup) return Alert.alert('PDF', 'Consenti le finestre popup per creare il PDF.');
    popup.document.write(`<html><head><title>${diet.nome || 'Dieta'}</title><style>body{font-family:Arial;padding:24px;color:#18212b}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left;vertical-align:top}th{background:#e8f1f4;width:110px}h1{margin-bottom:4px}small{color:#64748b}</style></head><body><h1>${diet.nome || 'Dieta'}</h1><small>${diet.datainizio || ''} - ${diet.datafine || ''}</small><table><tbody>${rows}</tbody></table></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  };

  const deleteDiet = () => {
    Alert.alert('Elimina dieta', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => { try { await api.delete(`/diets/${dietId}`); navigation.goBack(); } catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile eliminare la dieta'); } } },
    ]);
  };

  if (loading || !diet) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={typography.h1}>{diet.nome || 'Dieta'}</Text>
      <Text style={typography.caption}>
        {diet.datainizio ? String(diet.datainizio).slice(0, 10) : '—'} → {diet.datafine ? String(diet.datafine).slice(0, 10) : '—'}
      </Text>
      {!!diet.macrototali && <Text style={styles.macro}>{diet.macrototali}</Text>}
      {!!diet.notegenerali && <Text style={styles.paragraph}>{diet.notegenerali}</Text>}
      <Pressable style={styles.pdfButton} onPress={downloadPdf}><Text style={styles.pdfButtonText}>Scarica dieta in PDF</Text></Pressable>

      <View style={styles.section}>
        <Text style={typography.h3}>Pasti</Text>
        {['Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato', 'Domenica'].map((day) => {
          const dayMeals = (diet.pasti || []).filter((pasto) => (pasto.giorno_settimana || 'Lunedi') === day);
          if (!dayMeals.length) return null;
          return <View key={day} style={styles.daySection}>
            <Text style={styles.dayTitle}>{day}</Text>
            {dayMeals.map((pasto) => <View key={pasto.pastoid} style={styles.mealRow}>
              <Text style={styles.mealType}>{pasto.tipopasto}</Text>
              <Text style={styles.mealDesc}>{pasto.descrizione}</Text>
            </View>)}
          </View>;
        })}
        {!diet.pasti?.length && <Text style={typography.caption}>Nessun pasto definito.</Text>}
      </View>

      {isCoach && (
        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('DietEditor', { diet })}>
            <Text style={styles.secondaryButtonText}>Modifica</Text>
          </Pressable>
          <Pressable style={styles.dangerButton} onPress={deleteDiet}>
            <Text style={styles.dangerButtonText}>Elimina</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  macro: { ...typography.body, marginTop: spacing.sm, fontWeight: '700', color: colors.primary },
  paragraph: { ...typography.body, marginTop: spacing.sm, lineHeight: 20 },
  section: { marginTop: spacing.xl },
  daySection: { marginTop: spacing.md },
  dayTitle: { color: colors.primary, fontWeight: '800', marginBottom: spacing.xs },
  mealRow: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  mealType: { fontWeight: '700', color: colors.text },
  mealDesc: { ...typography.caption, marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
  dangerButton: { flex: 1, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerButtonText: { color: colors.danger, fontWeight: '700' },
  pdfButton: { marginTop: spacing.lg, backgroundColor: colors.primaryLight, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  pdfButtonText: { color: colors.primary, fontWeight: '800' },
});
