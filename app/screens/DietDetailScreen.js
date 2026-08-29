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

  const deleteDiet = () => {
    Alert.alert('Elimina dieta', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => { await api.delete(`/diets/${dietId}`); navigation.goBack(); } },
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

      <View style={styles.section}>
        <Text style={typography.h3}>Pasti</Text>
        {(diet.pasti || []).map((pasto) => (
          <View key={pasto.pastoid} style={styles.mealRow}>
            <Text style={styles.mealType}>{pasto.tipopasto}</Text>
            <Text style={styles.mealDesc}>{pasto.descrizione}</Text>
          </View>
        ))}
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
  mealRow: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.sm },
  mealType: { fontWeight: '700', color: colors.text },
  mealDesc: { ...typography.caption, marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
  dangerButton: { flex: 1, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  dangerButtonText: { color: colors.danger, fontWeight: '700' },
});
