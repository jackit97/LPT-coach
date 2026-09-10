import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Switch } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function ProfileScreen() {
  const { user, logout, isCoach, enduranceEnabled, setEnduranceEnabled, profileComplete, refreshAccountStatus } = useAuth();
  const isAthlete = user?.ruolo === 'cliente';
  const [profile, setProfile] = useState(user || {});
  const [saving, setSaving] = useState(false);
  const [togglingEndurance, setTogglingEndurance] = useState(false);

  useEffect(() => { api.get('/users/me').then(({ data }) => setProfile(data)).catch(() => {}); }, []);
  const [days, setDays] = useState([]);
  const toggleDay = (day) => setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]);
  useEffect(() => { setDays((profile.giorni_allenamento || '').split(',').map((day) => day.trim()).filter(Boolean)); }, [profile.giorni_allenamento]);
  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true);
    try { await api.put('/users/me/profile', { nome: profile.nome, cognome: profile.cognome, pesokg: profile.pesokg, altezzacm: profile.altezzacm, obiettivoallenamento: profile.obiettivoallenamento, durataAllenamentoMinuti: profile.durata_allenamento_minuti, giorniAllenamento: days.join(', '), livellofitness: profile.livellofitness, datanascita: profile.datanascita || null, sesso: profile.sesso || null }); await refreshAccountStatus(); Alert.alert('Profilo salvato', 'I dati sono visibili al coach.'); }
    catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare il profilo'); }
    finally { setSaving(false); }
  };

  const toggleEndurance = async (value) => {
    setTogglingEndurance(true);
    try { await api.put('/users/me/endurance-settings', { enabled: value }); setEnduranceEnabled(value); }
    catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile aggiornare la sezione endurance'); }
    finally { setTogglingEndurance(false); }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{user?.nome?.[0]?.toUpperCase() || '?'}</Text></View>
      <Text style={typography.h2}>{user?.nome}</Text>
      <Text style={typography.caption}>{user?.email}</Text>
      <Text style={styles.role}>{user?.ruolo === 'personal_trainer' ? 'Coach' : 'Atleta'}</Text>

      {isCoach && (
        <View style={styles.enduranceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Modulo Endurance</Text>
            <Text style={typography.caption}>Disattivalo per nascondere le sezioni e i campi endurance a te e ai tuoi atleti.</Text>
          </View>
          {togglingEndurance ? <ActivityIndicator color={colors.primary} /> : (
            <Switch value={enduranceEnabled} onValueChange={toggleEndurance} trackColor={{ true: colors.primary }} />
          )}
        </View>
      )}

      {isAthlete && !profileComplete && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>Completa il profilo qui sotto: una volta salvato verrai aggiunto automaticamente tra gli atleti del coach.</Text>
        </View>
      )}

      {isAthlete && <View style={styles.form}>
        <Text style={styles.sectionTitle}>Dati allenamento</Text>
        <Text style={styles.label}>Nome</Text><TextInput value={profile.nome || ''} onChangeText={(value) => update('nome', value)} style={styles.input} />
        <Text style={styles.label}>Cognome</Text><TextInput value={profile.cognome || ''} onChangeText={(value) => update('cognome', value)} style={styles.input} />
        <Text style={styles.label}>Data di nascita</Text><DateField value={profile.datanascita ? String(profile.datanascita).slice(0, 10) : ''} onChange={(value) => update('datanascita', value)} style={styles.dateField} />
        <Text style={styles.label}>Sesso</Text><View style={styles.sexRow}>{['Femmina', 'Maschio', 'Altro', 'Preferisco non indicarlo'].map((sex) => <Pressable key={sex} onPress={() => update('sesso', sex)} style={[styles.sexChip, profile.sesso === sex && styles.sexChipActive]}><Text style={[styles.sexText, profile.sesso === sex && styles.sexTextActive]}>{sex}</Text></Pressable>)}</View>
        <View style={styles.row}><View style={styles.half}><Text style={styles.label}>Peso (kg)</Text><TextInput value={String(profile.pesokg || '')} onChangeText={(value) => update('pesokg', value)} keyboardType="decimal-pad" style={styles.input} /></View><View style={styles.half}><Text style={styles.label}>Altezza (cm)</Text><TextInput value={String(profile.altezzacm || '')} onChangeText={(value) => update('altezzacm', value)} keyboardType="numeric" style={styles.input} /></View></View>
        <Text style={styles.label}>Obiettivo allenamento</Text><TextInput value={profile.obiettivoallenamento || ''} onChangeText={(value) => update('obiettivoallenamento', value)} style={[styles.input, styles.area]} multiline placeholder="Forza, dimagrimento, HYROX..." />
        <Text style={styles.label}>Durata desiderata (minuti)</Text><TextInput value={String(profile.durata_allenamento_minuti || '')} onChangeText={(value) => update('durata_allenamento_minuti', value)} keyboardType="numeric" style={styles.input} placeholder="60" />
        <Text style={styles.label}>Giorni di allenamento</Text><View style={styles.days}>{['Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato', 'Domenica'].map((day) => <Pressable key={day} onPress={() => toggleDay(day)} style={[styles.day, days.includes(day) && styles.dayActive]}><Text style={[styles.dayText, days.includes(day) && styles.dayTextActive]}>{day.slice(0, 3)}</Text></Pressable>)}</View>
        <Text style={styles.label}>Livello di forma fisica attuale</Text><TextInput value={profile.livellofitness || ''} onChangeText={(value) => update('livellofitness', value)} style={styles.input} placeholder="Principiante, intermedio, avanzato" />
        <Pressable style={styles.saveButton} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salva dati profilo</Text>}</Pressable>
      </View>}

      <Pressable style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Esci</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, content: { alignItems: 'center', padding: spacing.xl },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  avatarText: { color: colors.textInverse, fontSize: 32, fontWeight: '700' },
  role: { ...typography.caption, marginTop: spacing.sm, backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  enduranceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', maxWidth: 620, marginTop: spacing.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  warningBox: { width: '100%', maxWidth: 620, marginTop: spacing.xl, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B', borderRadius: radius.md, padding: spacing.md },
  warningText: { color: '#92400E', fontWeight: '600' },
  logoutBtn: { marginTop: spacing.xxl, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  logoutText: { color: colors.danger, fontWeight: '700' },
  form: { width: '100%', maxWidth: 620, marginTop: spacing.xl }, sectionTitle: { ...typography.h3, marginBottom: spacing.sm }, label: { ...typography.caption, marginTop: spacing.sm, marginBottom: spacing.xs }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface, marginBottom: spacing.xs }, area: { minHeight: 60, textAlignVertical: 'top' }, row: { flexDirection: 'row', gap: spacing.sm }, half: { flex: 1 }, sexRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }, sexChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface }, sexChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, sexText: { color: colors.textMuted, fontSize: 14 }, sexTextActive: { color: colors.primary, fontWeight: '700' }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, day: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface }, dayActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, dayText: { color: colors.textMuted }, dayTextActive: { color: colors.primary, fontWeight: '700' }, saveButton: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg }, saveText: { color: '#fff', fontWeight: '700' },
});
