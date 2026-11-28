import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../theme';

// Sezioni secondarie raccolte in un'unica pagina, per tenere la barra in basso con poche voci.
export function moreSections({ isCoach, enduranceEnabled, progressEnabled = true }) {
  return [
    enduranceEnabled && { tab: 'EnduranceTab', screen: 'EnduranceHome', icon: 'bicycle', color: '#16A34A', title: 'Piani endurance', desc: 'Periodizzazione, sessioni e obiettivi' },
    isCoach && { tab: 'StrengthTab', screen: 'StrengthHome', icon: 'barbell', color: '#2563EB', title: 'Pesistica', desc: 'Schede palestra multi-giorno' },
    enduranceEnabled && isCoach && { tab: 'ZonesTab', screen: 'ZonesHome', icon: 'speedometer', color: '#F59E0B', title: 'Zone e test', desc: 'Test atletici e zone di allenamento' },
    isCoach && enduranceEnabled && { tab: 'TemplatesTab', screen: 'TemplatesHome', icon: 'albums', color: '#7C3AED', title: 'Template piani', desc: 'Piani endurance riutilizzabili' },
    isCoach && { tab: 'ReportsTab', screen: 'ReportsHome', icon: 'document-text', color: '#9333EA', title: 'Report atleti', desc: 'Video di esecuzione, dubbi e feedback dagli allenamenti' },
    (isCoach || progressEnabled) && { tab: 'BodyTab', screen: 'BodyHome', icon: 'body', color: '#7C3AED', title: 'Valutazione corporea', desc: isCoach ? 'Plicometria, misure, composizione corporea e metabolismo' : 'Le tue misure, composizione corporea e andamento' },
    (isCoach || progressEnabled) && { tab: 'ChecksTab', screen: 'ChecksHome', icon: 'camera', color: '#0D9488', title: 'Check fotografici', desc: isCoach ? 'Richiedi le foto e commenta i progressi' : 'Carica le foto richieste dal coach' },
    // Solo coach: gli atleti vedono i video dentro le schede, toccando l'esercizio
    isCoach && { tab: 'VideosTab', screen: 'VideosHome', icon: 'play-circle', color: '#DC2626', title: 'Video tutorial', desc: 'Carica i video e collegali agli esercizi' },
    isCoach && { tab: 'ExercisesTab', screen: 'ExercisesHome', icon: 'list', color: '#4F46E5', title: 'Catalogo esercizi', desc: 'Aggiungi, rinomina o elimina gli esercizi' },
    { tab: 'NotificationsTab', screen: 'NotificationsHome', icon: 'notifications', color: '#2563EB', title: 'Notifiche', desc: 'Novità su allenamenti, check e diete' },
    { tab: 'PaymentsTab', screen: 'PaymentsHome', icon: 'card', color: '#EA580C', title: 'Pagamenti', desc: isCoach ? 'Scadenze e incassi degli atleti' : 'Le tue scadenze' },
  ].filter(Boolean);
}

export default function MoreScreen({ navigation }) {
  const { isCoach, isDeveloper, enduranceEnabled, progressEnabled, user, logout } = useAuth();
  const sections = isDeveloper
    ? [{ tab: 'NotificationsTab', screen: 'NotificationsHome', icon: 'notifications', color: '#2563EB', title: 'Notifiche', desc: 'Nuove segnalazioni degli utenti' }]
    : moreSections({ isCoach, enduranceEnabled, progressEnabled });
  const RowLink = ({ icon, color, bg, title, desc, onPress }) => (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={[styles.iconWrap, { backgroundColor: bg }]}><Ionicons name={icon} size={24} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
  const open = (item) => navigation.navigate(item.tab, { screen: item.screen, params: { fromMore: true } });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        {sections.map((item) => (
          <Pressable key={item.tab} style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => open(item)}>
            <View style={[styles.iconWrap, { backgroundColor: `${item.color}18` }]}>
              <Ionicons name={item.icon} size={24} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.desc}>{item.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.grid}>
        <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => navigation.navigate('Profile')}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="person-circle" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Profilo</Text>
            <Text style={styles.desc}>{user?.email || 'Dati personali e connessioni'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        {!isDeveloper && (
          <RowLink icon="chatbox-ellipses" color="#7C3AED" bg="#EDE9FE" title="Feedback / errori app" desc="Segnala un problema o suggerisci un miglioramento" onPress={() => navigation.navigate('Feedback')} />
        )}
        <RowLink icon="shield-checkmark" color="#0D9488" bg="#CCFBF1" title="Privacy" desc="Informativa privacy e termini d'uso" onPress={() => navigation.navigate('Privacy')} />
        <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={logout}>
          <View style={[styles.iconWrap, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="log-out-outline" size={24} color={colors.danger} />
          </View>
          <Text style={[styles.title, { flex: 1, color: colors.danger }]}>Esci</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  grid: { gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  pressed: { opacity: 0.75 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  desc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginTop: spacing.xl, marginBottom: spacing.sm },
});
