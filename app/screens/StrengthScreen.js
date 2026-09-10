import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';

export default function StrengthScreen({ navigation }) {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!targetUserId) { setSheets([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/calendar/strength-sheets', { params: { utenteId: targetUserId } });
      setSheets(data || []);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (isCoach && !selectedAthlete) {
    return (
      <View style={styles.center}>
        <Text style={typography.h2}>Seleziona un atleta</Text>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Clients')}>
          <Text style={styles.primaryButtonText}>Vai ai tuoi atleti</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isCoach && <AthletePicker />}
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={sheets}
          keyExtractor={(item) => item.nome}
          contentContainerStyle={{ padding: spacing.lg }}
          ListHeaderComponent={<Text style={styles.heading}>{isCoach ? `Pesistica di ${selectedAthlete?.nome}` : 'I miei allenamenti di pesistica'}</Text>}
          ListEmptyComponent={<Text style={styles.empty}>Nessuna scheda di pesistica assegnata.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => navigation.navigate('StrengthSheetDetail', { sheet: item })}>
              <Text style={typography.h3}>{item.nome}</Text>
              <Text style={styles.date}>{item.giorni.length} giorni · {item.datainizio ? String(item.datainizio).slice(0, 10) : 'senza data'} → {item.datafine ? String(item.datafine).slice(0, 10) : 'senza scadenza'}</Text>
            </Pressable>
          )}
        />
      )}
      {isCoach && targetUserId && (
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate('StrengthSheetEditor', { utenteId: targetUserId })}
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  heading: { ...typography.h2, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  date: { ...typography.caption, marginTop: spacing.xs },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  fabText: { color: colors.textInverse, fontSize: 28, fontWeight: '700' },
});