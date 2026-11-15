import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';
import { MACRO_COLORS } from '../utils/nutrition';

const fmtDate = (value) => (value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// "Kcal: 2200 P: 160 C: 240 F: 70" -> { kcal, p, c, f }
function parseMacros(text) {
  const read = (key) => { const match = String(text || '').match(new RegExp(`\\b${key}\\s*:?\\s*(\\d+)`, 'i')); return match ? Number(match[1]) : null; };
  const kcal = read('kcal');
  return kcal ? { kcal, p: read('P'), c: read('C'), f: read('F') } : null;
}

function dietStatus(item) {
  const today = new Date().toISOString().slice(0, 10);
  const start = item.datainizio ? String(item.datainizio).slice(0, 10) : null;
  const end = item.datafine ? String(item.datafine).slice(0, 10) : null;
  if (end && end < today) return { label: 'Scaduta', color: colors.danger, bg: '#fef2f2', progress: 1 };
  if (start && start > today) return { label: 'Programmata', color: colors.accent, bg: colors.primaryLight, progress: 0 };
  const progress = start && end ? Math.min(1, Math.max(0, (new Date(today) - new Date(start)) / Math.max(1, new Date(end) - new Date(start)))) : null;
  return { label: 'Attiva', color: '#047857', bg: '#ecfdf5', progress };
}

export default function DietsScreen({ navigation }) {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();
  const [diets, setDiets] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!targetUserId) { setDiets([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/diets', { params: { utenteId: targetUserId } });
      setDiets(data || []);
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
          data={diets}
          keyExtractor={(item) => String(item.dietaid)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<Text style={styles.empty}>Nessuna dieta ancora.</Text>}
          renderItem={({ item }) => {
            const status = dietStatus(item);
            const macros = parseMacros(item.macrototali);
            return (
              <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]} onPress={() => navigation.navigate('DietDetail', { dietId: item.dietaid })}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardIcon}>🥗</Text>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.nome || 'Dieta'}</Text>
                  <Text style={[styles.status, { color: status.color, backgroundColor: status.bg }]}>{status.label}</Text>
                </View>
                <Text style={typography.caption}>{fmtDate(item.datainizio)} → {fmtDate(item.datafine)}</Text>
                {status.progress !== null && (
                  <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(status.progress * 100)}%`, backgroundColor: status.color }]} /></View>
                )}
                {macros ? (
                  <View style={styles.macroRow}>
                    <Text style={styles.kcal}>{macros.kcal} kcal/giorno</Text>
                    {macros.p !== null && <Text style={[styles.macro, { color: MACRO_COLORS.proteins }]}>P {macros.p} g</Text>}
                    {macros.c !== null && <Text style={[styles.macro, { color: MACRO_COLORS.carbs }]}>C {macros.c} g</Text>}
                    {macros.f !== null && <Text style={[styles.macro, { color: MACRO_COLORS.fat }]}>G {macros.f} g</Text>}
                  </View>
                ) : (!!item.macrototali && <Text style={styles.macroText}>{item.macrototali}</Text>)}
              </Pressable>
            );
          }}
        />
      )}

      {isCoach && targetUserId && (
        <Pressable style={styles.fab} onPress={() => navigation.navigate('DietEditor', { utenteId: targetUserId })}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: '#DB2777', padding: spacing.md, marginBottom: spacing.sm, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  cardIcon: { fontSize: 18 },
  cardTitle: { ...typography.h3, flex: 1 },
  status: { fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  macroRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  kcal: { fontSize: 15, fontWeight: '800', color: colors.text },
  macro: { fontSize: 12, fontWeight: '800' },
  macroText: { ...typography.caption, marginTop: spacing.xs, fontWeight: '600' },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  fab: {
    position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  fabText: { color: colors.textInverse, fontSize: 28, fontWeight: '700', marginTop: -2 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
});
