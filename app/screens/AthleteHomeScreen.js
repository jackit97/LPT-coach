import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LogStrengthDayModal from '../components/LogStrengthDayModal';
import { colors, spacing, radius, typography, workoutTypeColors } from '../theme';
import { sportInfo, formatShortDuration } from '../utils/endurance';

const FEED_STYLE = {
  consiglio: { icon: 'bulb', color: '#F59E0B' },
  report: { icon: 'chatbubbles', color: '#9333EA' },
  check: { icon: 'camera', color: '#0D9488' },
};
const dayLabel = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
function timeAgo(value) {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h fa`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} g fa`;
  return new Date(value).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

function WorkoutCard({ workout, onPress, showDate }) {
  const sport = sportInfo(workout.sport);
  const color = sport?.color || workoutTypeColors[workout.tipo] || colors.primary;
  const seconds = workout.load?.secondi_pianificati || workout.durata_secondi || (workout.durata_minuti ? workout.durata_minuti * 60 : 0);
  const done = workout.stato === 'completato';
  return (
    <Pressable style={({ pressed }) => [styles.workout, { borderLeftColor: color }, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        {showDate && <Text style={styles.workoutDate}>{dayLabel(workout.data)}</Text>}
        <Text style={styles.workoutTitle} numberOfLines={2}>{workout.titolo}</Text>
        <Text style={styles.workoutMeta}>
          {sport ? `${sport.icon} ${sport.label}` : workout.tipo === 'forza' ? '🏋️ Forza' : workout.tipo}
          {seconds ? ` · ${formatShortDuration(seconds)}` : ''}
        </Text>
      </View>
      {done ? (
        <View style={styles.donePill}><Ionicons name="checkmark" size={14} color={colors.success} /><Text style={styles.doneText}>Fatto</Text></View>
      ) : <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
    </Pressable>
  );
}

// Home dell'atleta: allenamento del giorno, messaggi del coach, prossimi allenamenti
export default function AthleteHomeScreen({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [home, strength] = await Promise.all([
        api.get('/calendar/home').then((r) => r.data),
        api.get('/calendar/strength-sheets').then((r) => r.data || []).catch(() => []),
      ]);
      setData(home);
      const today = home?.oggi;
      setSheets(strength.filter((sheet) => String(sheet.datainizio).slice(0, 10) <= today && (!sheet.datafine || String(sheet.datafine).slice(0, 10) >= today)));
    } catch {
      setData((current) => current || { allenamenti_oggi: [], prossimi: [], dal_coach: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openWorkout = (workoutId) => navigation.navigate('CalendarTab', { screen: 'WorkoutDetail', params: { workoutId }, initial: false });
  const openLink = (link) => {
    if (!link?.screen) return;
    const tab = { WorkoutDetail: 'CalendarTab', CheckDetail: 'ChecksTab' }[link.screen];
    if (tab) navigation.navigate(tab, { screen: link.screen, params: link.params || {}, initial: false });
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  const today = data?.allenamenti_oggi || [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={styles.hello}>Ciao {String(user?.nome || '').split(' ')[0] || ''} 👋</Text>
      <Text style={styles.date}>{data?.oggi ? dayLabel(data.oggi) : ''}</Text>

      <Text style={styles.section}>Oggi</Text>
      {today.length ? today.map((workout) => (
        <WorkoutCard key={workout.workout_id} workout={workout} onPress={() => openWorkout(workout.workout_id)} />
      )) : (
        <View style={styles.rest}>
          <Ionicons name="cafe-outline" size={22} color={colors.textMuted} />
          <Text style={styles.restText}>Nessun allenamento in programma oggi.</Text>
        </View>
      )}
      {sheets.length > 0 && (
        <Pressable style={styles.logBtn} onPress={() => setLogOpen(true)}>
          <Ionicons name="barbell" size={18} color={colors.primary} />
          <Text style={styles.logText}>Ho fatto un giorno della scheda</Text>
        </Pressable>
      )}

      <Text style={styles.section}>Dal tuo coach</Text>
      {(data?.dal_coach || []).length ? data.dal_coach.map((item) => {
        const style = FEED_STYLE[item.tipo] || FEED_STYLE.consiglio;
        return (
          <Pressable key={item.id} style={styles.feed} onPress={() => openLink(item.link)} disabled={!item.link}>
            <View style={[styles.feedIcon, { backgroundColor: `${style.color}1F` }]}><Ionicons name={style.icon} size={18} color={style.color} /></View>
            <View style={{ flex: 1 }}>
              <View style={styles.feedHead}>
                <Text style={styles.feedTitle} numberOfLines={1}>{item.titolo}</Text>
                <Text style={styles.feedTime}>{timeAgo(item.data)}</Text>
              </View>
              <Text style={styles.feedText}>{item.testo}</Text>
            </View>
          </Pressable>
        );
      }) : <Text style={styles.empty}>Qui troverai i consigli del coach e le sue risposte ai tuoi report e check.</Text>}

      {(data?.prossimi || []).length > 0 && (
        <>
          <Text style={styles.section}>Prossimi allenamenti</Text>
          {data.prossimi.map((workout) => (
            <WorkoutCard key={workout.workout_id} workout={workout} showDate onPress={() => openWorkout(workout.workout_id)} />
          ))}
        </>
      )}

      <LogStrengthDayModal
        visible={logOpen}
        sheets={sheets}
        onClose={() => setLogOpen(false)}
        onLogged={(result) => { setLogOpen(false); if (result?.workout_id) openWorkout(result.workout_id); }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, maxWidth: 820, width: '100%', alignSelf: 'center' },
  hello: { ...typography.h1 },
  date: { ...typography.caption, marginTop: 2, textTransform: 'capitalize' },
  section: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.xl, marginBottom: spacing.sm },
  workout: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 5, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  workoutDate: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'capitalize' },
  workoutTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  workoutMeta: { ...typography.caption, marginTop: 2 },
  donePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DCFCE7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  doneText: { color: colors.success, fontWeight: '800', fontSize: 12 },
  rest: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  restText: { flex: 1, ...typography.caption },
  logBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  logText: { color: colors.primary, fontWeight: '800' },
  feed: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  feedIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  feedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  feedTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.text },
  feedTime: { fontSize: 11, color: colors.textMuted },
  feedText: { fontSize: 14, color: colors.text, marginTop: 3, lineHeight: 20 },
  empty: { ...typography.caption },
});
