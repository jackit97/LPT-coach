import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';

// Horizontal chip picker so a coach can switch athlete from any tab.
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wrap} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
      {clients.map((client) => {
        const active = selectedAthlete?.utenteid === client.utenteid;
        return (
          <Pressable key={client.utenteid} onPress={() => setSelectedAthlete(client)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{client.nome}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0, backgroundColor: colors.surface, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.primary },
  empty: { padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
});
