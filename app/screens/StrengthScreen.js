import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import LogStrengthDayModal from '../components/LogStrengthDayModal';
import { colors, spacing, radius, typography } from '../theme';

const iso = (value) => (value ? String(value).slice(0, 10) : null);
const fmt = (value) => (value ? iso(value).split('-').reverse().join('/') : '—');
const fmtShort = (value) => (value ? iso(value).split('-').reverse().slice(0, 2).join('/') : null);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Pesistica: scheda attiva con tutti i giorni (e "L'ho fatto"), schede in arrivo e storico delle schede passate
export default function StrengthScreen({ navigation }) {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [logFor, setLogFor] = useState(null); // { sheets, schedaid }

  const load = useCallback(async () => {
    if (!targetUserId) { setSheets([]); setLoading(false); return; }
    try {
      const { data } = await api.get('/calendar/strength-sheets', { params: { utenteId: targetUserId } });
      setSheets(data || []);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.response?.data?.message || 'Impossibile caricare le schede. Riprova.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [targetUserId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = localToday();
  const groups = useMemo(() => {
    const active = [];
    const upcoming = [];
    const past = [];
    for (const sheet of sheets) {
      const start = iso(sheet.datainizio);
      const end = iso(sheet.datafine);
      if (end && end < today) past.push(sheet);
      else if (start && start > today) upcoming.push(sheet);
      else active.push(sheet);
    }
    past.sort((a, b) => String(iso(b.datafine)).localeCompare(String(iso(a.datafine))));
    return { active, upcoming, past };
  }, [sheets, today]);

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

  const openSheet = (sheet) => navigation.navigate('StrengthSheetDetail', { sheet });
  const openWorkout = (workoutId) => navigation.navigate('CalendarTab', { screen: 'WorkoutDetail', params: { workoutId }, initial: false });

  const SheetCard = ({ sheet, highlight }) => (
    <View style={[styles.sheet, highlight && styles.sheetActive]}>
      <Pressable onPress={() => openSheet(sheet)} style={styles.sheetHead}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.sheetName} numberOfLines={2}>{sheet.nome}</Text>
            {sheet.programmazione === 'auto' && <Text style={styles.autoBadge}>Automatica</Text>}
          </View>
          <Text style={styles.sheetMeta}>{sheet.giorni.length} giorni · {fmt(sheet.datainizio)} → {sheet.datafine ? fmt(sheet.datafine) : 'senza scadenza'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
      {highlight && sheet.giorni.map((day) => (
        <View key={day.schedaid} style={styles.day}>
          <Pressable style={{ flex: 1 }} onPress={() => openSheet(sheet)}>
            <Text style={styles.dayName}>{day.nome}</Text>
            <Text style={styles.dayMeta} numberOfLines={2}>
              {day.esercizi.length} esercizi
              {day.ultima_volta ? ` · fatto il ${fmtShort(day.ultima_volta)}` : ' · non ancora fatto'}
              {day.prossima_volta ? ` · prossimo ${fmtShort(day.prossima_volta)}` : ''}
            </Text>
            {!!day.esercizi.length && <Text style={styles.dayExercises} numberOfLines={1}>{day.esercizi.map((exercise) => exercise.nome).join(' · ')}</Text>}
          </Pressable>
          {!isCoach && (
            <Pressable style={styles.doneBtn} onPress={() => setLogFor({ sheets: [sheet], schedaid: day.schedaid })}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.doneText}>L'ho fatto</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      {isCoach && <AthletePicker />}
      {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <Text style={styles.heading}>{isCoach ? `Pesistica di ${selectedAthlete?.nome}` : 'La mia pesistica'}</Text>
          {!!error && (
            <Pressable onPress={load}><Text style={styles.error}>{error}{'\n'}Tocca per riprovare.</Text></Pressable>
          )}

          <Text style={styles.section}>{groups.active.length > 1 ? 'Schede attive' : 'Scheda attiva'}</Text>
          {groups.active.length ? groups.active.map((sheet) => <SheetCard key={sheet.nome} sheet={sheet} highlight />) : (
            <Text style={styles.empty}>{isCoach ? 'Nessuna scheda attiva: creane una con il +.' : 'Nessuna scheda attiva in questo momento.'}</Text>
          )}
          {!isCoach && groups.active.length > 0 && (
            <Text style={styles.hint}>Non segui l'ordine del coach o manca un allenamento in calendario? Tocca «L'ho fatto» sul giorno che hai fatto e scegli la data.</Text>
          )}

          {groups.upcoming.length > 0 && (
            <>
              <Text style={styles.section}>In arrivo</Text>
              {groups.upcoming.map((sheet) => <SheetCard key={sheet.nome} sheet={sheet} />)}
            </>
          )}

          {groups.past.length > 0 && (
            <>
              <Pressable style={styles.pastToggle} onPress={() => setShowPast((value) => !value)}>
                <Text style={[styles.section, { marginTop: 0, flex: 1 }]}>Schede passate ({groups.past.length})</Text>
                <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
              </Pressable>
              {showPast && groups.past.map((sheet) => <SheetCard key={sheet.nome} sheet={sheet} />)}
            </>
          )}
        </ScrollView>
      )}
      {isCoach && targetUserId && (
        <Pressable style={styles.fab} onPress={() => navigation.navigate('StrengthSheetEditor', { utenteId: targetUserId })}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
      <LogStrengthDayModal
        visible={!!logFor}
        sheets={logFor?.sheets || []}
        defaultSchedaId={logFor?.schedaid}
        onClose={() => setLogFor(null)}
        onLogged={(result) => { setLogFor(null); load(); if (result?.workout_id) openWorkout(result.workout_id); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  content: { padding: spacing.lg, paddingBottom: 100, maxWidth: 900, width: '100%', alignSelf: 'center' },
  heading: { ...typography.h2 },
  section: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.xl, marginBottom: spacing.sm },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, overflow: 'hidden' },
  sheetActive: { borderColor: colors.primary, borderWidth: 1.5 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  sheetName: { fontSize: 17, fontWeight: '800', color: colors.text, flexShrink: 1 },
  autoBadge: { fontSize: 10, fontWeight: '800', color: colors.primary, backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  sheetMeta: { ...typography.caption, marginTop: 2 },
  day: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  dayName: { fontSize: 15, fontWeight: '800', color: colors.text },
  dayMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  dayExercises: { fontSize: 12, color: colors.primary, marginTop: 2 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 8 },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  hint: { ...typography.caption, marginTop: spacing.xs },
  pastToggle: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { ...typography.caption },
  error: { color: colors.danger, fontWeight: '700', marginTop: spacing.md },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  fabText: { color: colors.textInverse, fontSize: 28, fontWeight: '700' },
});
