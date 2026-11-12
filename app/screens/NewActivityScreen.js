import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useAthlete } from '../context/AthleteContext';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

const SPORTS = [
  { key: 'nuoto', label: 'Nuoto', icon: '🏊', color: '#1c84c6', tab: 'EnduranceTab', screen: 'EnduranceWorkoutEditor' },
  { key: 'ciclismo', label: 'Ciclismo', icon: '🚴', color: '#1ab394', tab: 'EnduranceTab', screen: 'EnduranceWorkoutEditor' },
  { key: 'corsa', label: 'Corsa', icon: '🏃', color: '#f37021', tab: 'EnduranceTab', screen: 'EnduranceWorkoutEditor' },
  { key: 'palestra', label: 'Palestra', icon: '🏋️', color: '#7c3aed', tab: 'StrengthTab', screen: 'StrengthSheetEditor' },
  { key: 'funzionale', label: 'Funzionale', icon: '⚡', color: '#0d9488', tab: 'EnduranceTab', screen: 'FunctionalWorkoutEditor' },
];

const OTHERS = [
  { key: 'libreria', label: 'Dalla libreria', icon: '▤', desc: 'Assegna un allenamento salvato', action: 'library' },
  { key: 'dieta', label: 'Nutrizione / Dieta', icon: '🥗', desc: 'Crea o modifica la dieta', tab: 'DietsTab', screen: 'DietEditor' },
  { key: 'pagamento', label: 'Pagamento', icon: '💶', desc: 'Gestisci scadenze e pagamenti', tab: 'PaymentsTab', screen: 'PaymentsHome' },
];

export default function NewActivityScreen({ route, navigation }) {
  const { selectedAthlete } = useAthlete();
  const { enduranceEnabled } = useAuth();
  const date = route.params?.date;
  const athleteId = route.params?.utenteId || selectedAthlete?.utenteid;

  const handleSport = (sport) => {
    navigation.getParent()?.navigate(sport.tab, {
      screen: sport.screen,
      params: { utenteId: athleteId, date, sport: sport.key },
    });
  };

  const handleOther = (item) => {
    if (item.action === 'library') {
      navigation.navigate('WorkoutLibrary', { date, utenteId: athleteId });
    } else {
      navigation.getParent()?.navigate(item.tab, {
        screen: item.screen,
        params: { utenteId: athleteId, date },
      });
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.modalCard}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Scegli un'attività</Text>
          <Text style={styles.headerSubtitle}>
            {selectedAthlete?.nome || 'Atleta'} · {date || 'Oggi'}
          </Text>
        </View>

        <Text style={styles.sectionHeading}>Aggiungi allenamento</Text>
        <View style={styles.sportsGrid}>
          {SPORTS.map((s) => (
            <Pressable
              key={s.key}
              style={({ pressed }) => [styles.sportBtn, pressed && styles.btnPressed]}
              onPress={() => handleSport(s)}
            >
              <View style={[styles.sportIconCircle, { backgroundColor: `${s.color}18` }]}>
                <Text style={styles.sportIcon}>{s.icon}</Text>
              </View>
              <Text style={styles.sportLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionHeading, { marginTop: spacing.xl }]}>Aggiungi altro</Text>
        <View style={styles.othersList}>
          {OTHERS.map((o) => (
            <Pressable
              key={o.key}
              style={({ pressed }) => [styles.otherCard, pressed && styles.btnPressed]}
              onPress={() => handleOther(o)}
            >
              <Text style={styles.otherIcon}>{o.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.otherTitle}>{o.label}</Text>
                <Text style={styles.otherDesc}>{o.desc}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f4f8' },
  content: { padding: spacing.lg, alignItems: 'center' },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e7eaec',
    padding: spacing.xl,
    width: '100%',
    maxWidth: 600,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f8',
    paddingBottom: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#2f4050' },
  headerSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#676a6c',
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sportsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sportBtn: {
    flexBasis: '30%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 8,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  sportIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  sportIcon: { fontSize: 28 },
  sportLabel: { fontSize: 13, fontWeight: '700', color: '#2f4050' },

  othersList: { gap: spacing.sm },
  otherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#fbfcfd',
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 6,
    padding: spacing.md,
  },
  otherIcon: { fontSize: 22 },
  otherTitle: { fontSize: 14, fontWeight: '700', color: '#2f4050' },
  otherDesc: { fontSize: 12, color: '#888', marginTop: 1 },
  chevron: { fontSize: 20, color: '#aaa', fontWeight: '300' },
});
