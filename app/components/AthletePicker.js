import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';
import { fullName } from '../utils/names';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'AT';

export default function AthletePicker() {
  const { clients, selectedAthlete, setSelectedAthlete } = useAthlete();

  if (!clients.length) {
    return (
      <View style={styles.empty}>
        <Text style={typography.caption}>Nessun atleta collegato. Vai su "Atleti" per aggiungerne uno.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Atleta</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{clients.length}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {clients.map((client) => {
          const active = selectedAthlete?.utenteid === client.utenteid;
          const name = fullName(client);
          return (
            <Pressable
              key={client.utenteid}
              onPress={() => setSelectedAthlete(client)}
              style={[styles.card, active && styles.cardActive]}
            >
              <View style={[styles.avatar, active && styles.avatarActive]}>
                <Text style={[styles.avatarText, active && styles.avatarTextActive]}>{initials(name)}</Text>
              </View>
              <View style={styles.meta}>
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>{name}</Text>
                <Text style={styles.subName}>{active ? 'Selezionato' : 'Apri scheda'}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: colors.textMuted, textTransform: 'uppercase' },
  pill: {
    minWidth: 26,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  content: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 180,
    maxWidth: 220,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f8fafc',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  cardActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: { backgroundColor: colors.primary },
  avatarText: { fontSize: 11, fontWeight: '800', color: colors.text },
  avatarTextActive: { color: colors.textInverse },
  meta: { flex: 1 },
  name: { fontSize: 13, fontWeight: '700', color: colors.text },
  nameActive: { color: colors.primary },
  subName: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  empty: { padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
});
