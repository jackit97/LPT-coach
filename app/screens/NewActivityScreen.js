import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAthlete } from '../context/AthleteContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function NewActivityScreen({ route, navigation }) {
  const { selectedAthlete } = useAthlete();
  const { enduranceEnabled } = useAuth();
  const date = route.params?.date;
  const athleteId = route.params?.utenteId || selectedAthlete?.utenteid;

  const go = (tab, screen, params = {}) => navigation.getParent()?.navigate(tab, { screen, params: { ...params, utenteId: athleteId, date } });

  return (
    <View style={styles.screen}>
      <Text style={typography.h1}>Nuova attività</Text>
      <Text style={styles.athlete}>{selectedAthlete?.nome || 'Atleta selezionato'}</Text>
      {!!date && <Text style={styles.date}>Data selezionata: {date}</Text>}
      <Text style={styles.heading}>Scegli cosa vuoi creare</Text>
      <Pressable style={styles.action} onPress={() => go('StrengthTab', 'StrengthSheetEditor')}><Text style={styles.actionTitle}>Pesistica</Text><Text style={styles.actionText}>Crea una scheda fino a 7 giorni con esercizi, serie e recuperi.</Text></Pressable>
      {enduranceEnabled && <Pressable style={styles.action} onPress={() => go('EnduranceTab', 'EnduranceWorkoutEditor')}><Text style={styles.actionTitle}>Endurance</Text><Text style={styles.actionText}>Crea un allenamento con fasi, metri, ripetizioni, durata e zone.</Text></Pressable>}
      <Pressable style={styles.action} onPress={() => go('EnduranceTab', 'FunctionalWorkoutEditor')}><Text style={styles.actionTitle}>Funzionale</Text><Text style={styles.actionText}>Crea un circuito con esercizi, ripetizioni, metri o minuti.</Text></Pressable>
      <Pressable style={styles.action} onPress={() => go('DietsTab', 'DietEditor')}><Text style={styles.actionTitle}>Dieta</Text><Text style={styles.actionText}>Apri la creazione della dieta dell'atleta.</Text></Pressable>
      <Pressable style={styles.action} onPress={() => go('PaymentsTab', 'PaymentsHome')}><Text style={styles.actionTitle}>Pagamento</Text><Text style={styles.actionText}>Gestisci pagamenti e scadenze dell'atleta.</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl }, athlete: { ...typography.h2, color: colors.primary, marginTop: spacing.xs }, date: { ...typography.caption, marginTop: spacing.xs }, heading: { ...typography.h3, marginTop: spacing.xxl, marginBottom: spacing.sm }, action: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }, actionTitle: { ...typography.h3, color: colors.primary }, actionText: { ...typography.caption, marginTop: spacing.xs } });
