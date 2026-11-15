import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import { useAthlete } from '../context/AthleteContext';
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

const shortName = (name = '') => {
  const pieces = name.split(/\s+/).filter(Boolean);
  if (!pieces.length) return 'AT';
  return pieces.slice(0, 2).map((piece) => piece[0]?.toUpperCase()).join('');
};

export default function NewActivityScreen({ route, navigation }) {
  const { selectedAthlete } = useAthlete();
  const date = route.params?.date;
  const athleteId = route.params?.utenteId || selectedAthlete?.utenteid;
  const [quickNote, setQuickNote] = useState('');

  const athleteLabel = selectedAthlete?.nome || 'Atleta';
  const initials = useMemo(() => shortName(athleteLabel), [athleteLabel]);

  const handleSport = (sport) => {
    navigation.getParent()?.navigate(sport.tab, {
      screen: sport.screen,
      params: { utenteId: athleteId, date, sport: sport.key, coachNote: quickNote.trim() },
    });
  };

  const handleOther = (item) => {
    if (item.action === 'library') {
      navigation.navigate('WorkoutLibrary', { date, utenteId: athleteId, coachNote: quickNote.trim() });
      return;
    }

    navigation.getParent()?.navigate(item.tab, {
      screen: item.screen,
      params: { utenteId: athleteId, date, coachNote: quickNote.trim() },
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.modalCard}>
        <View style={styles.header}>
          <View style={styles.athleteRow}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.headerMeta}>
              <Text style={styles.headerTitle}>Nuova attività</Text>
              <Text style={styles.headerSubtitle}>{athleteLabel} · {date || 'Oggi'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Coach</Text>
            <Text style={styles.summaryValue}>Sezione allenamento</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Data</Text>
            <Text style={styles.summaryValue}>{date || 'Oggi'}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>Aggiungi allenamento</Text>
        <View style={styles.sportsGrid}>
          {SPORTS.map((s) => (
            <Pressable
              key={s.key}
              style={({ pressed }) => [styles.sportBtn, pressed && styles.btnPressed]}
              onPress={() => handleSport(s)}
            >
              <View style={[styles.sportIconCircle, { backgroundColor: `${s.color}15` }]}>
                <Text style={styles.sportIcon}>{s.icon}</Text>
              </View>
              <Text style={styles.sportLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Nota coach</Text>
          <TextInput
            value={quickNote}
            onChangeText={setQuickNote}
            style={styles.noteInput}
            multiline
            placeholder="Istruzioni, obiettivo, richieste per l'atleta..."
            placeholderTextColor="#9ca3af"
          />
        </View>

        <Text style={[styles.sectionHeading, { marginTop: spacing.lg }]}>Aggiungi altro</Text>
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: spacing.xl,
    width: '100%',
    maxWidth: 640,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
  },
  athleteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  headerMeta: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#101828' },
  headerSubtitle: { fontSize: 13, color: '#667085', marginTop: 2 },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryPill: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  summaryLabel: { fontSize: 10, color: '#667085', letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '700' },
  summaryValue: { fontSize: 12, fontWeight: '700', color: '#111827', marginTop: 2 },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475467',
    marginBottom: spacing.md,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sportsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sportBtn: {
    flexGrow: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  btnPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  sportIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  sportIcon: { fontSize: 30 },
  sportLabel: { fontSize: 13, fontWeight: '800', color: '#111827' },

  noteBox: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: spacing.md,
  },
  noteTitle: { fontSize: 12, fontWeight: '700', color: '#475467', marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  noteInput: {
    borderWidth: 1,
    borderColor: '#dfe7ef',
    backgroundColor: '#fff',
    borderRadius: 8,
    minHeight: 84,
    padding: spacing.sm,
    fontSize: 13,
    color: '#111827',
    textAlignVertical: 'top',
  },

  othersList: { gap: spacing.sm, marginTop: spacing.sm },
  otherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#fbfcfd',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: spacing.md,
  },
  otherIcon: { fontSize: 24 },
  otherTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  otherDesc: { fontSize: 12, color: '#667085', marginTop: 2 },
  chevron: { fontSize: 22, color: '#98a2b3', fontWeight: '300' },
});
