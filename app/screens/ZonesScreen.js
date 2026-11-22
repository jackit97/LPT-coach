import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import DateField from '../components/DateField';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import { colors, spacing, radius, typography } from '../theme';
import { fullName } from '../utils/names';

const ZONE_GROUPS = [
  { key: 'pace', label: '🏃 Corsa · zone passo' },
  { key: 'power', label: '🚴 Ciclismo · zone potenza' },
  { key: 'swimPace', label: '🏊 Nuoto · zone passo' },
  { key: 'heartRate', label: '❤ Zone frequenza cardiaca' },
];
const ZONE_UNITS = { pace: '/km', power: 'W', heartRate: 'bpm', swimPace: '/100m' };
const ZONE_COLORS = { Z1: '#8ed1d1', Z2: '#58c86b', Z3: '#f5e832', Z4: '#f4a340', Z5: '#ef4141', Z6: '#a83232', Z7: '#d96be8' };

export default function ZonesScreen() {
  const { isCoach } = useAuth();
  const { selectedAthlete, targetUserId } = useAthlete();
  const [zones, setZones] = useState({ pace: [], power: [], heartRate: [], swimPace: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [testTypeId, setTestTypeId] = useState(null);
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [rawResult, setRawResult] = useState('');
  const [testNotes, setTestNotes] = useState('');
  const [savingTest, setSavingTest] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState(null);
  const normalizeZones = (value) => {
    const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return {}; } })() : value;
    return Object.fromEntries(Object.entries({ pace: [], power: [], heartRate: [], swimPace: [], ...(parsed || {}) })
      .filter(([, items]) => Array.isArray(items))
      .map(([group, list]) => [group, list.some((item) => item.key === 'Z7') ? list : [...list, { key: 'Z7', name: 'Neuromuscolare', min: '', max: '', unit: ZONE_UNITS[group] || '' }]]));
  };

  const load = useCallback(async () => {
    if (!targetUserId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data: zoneData }, { data: testData }, { data: resultData }] = await Promise.all([
        api.get('/zones', { params: { utenteId: targetUserId } }), api.get('/zones/tests/types'), api.get('/zones/tests/results', { params: { utenteId: targetUserId } }),
      ]);
      setZones(normalizeZones(zoneData.zones)); setTests(testData || []); setResults(resultData || []);
      if (!testTypeId && testData?.[0]) setTestTypeId(testData[0].test_type_id);
    }
    finally { setLoading(false); }
  }, [targetUserId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const update = (group, index, field, value) => setZones((current) => ({ ...current, [group]: current[group].map((zone, i) => i === index ? { ...zone, [field]: value } : zone) }));
  const save = async () => {
    setSaving(true);
    try { await api.put('/zones', { athleteId: targetUserId, zones }); Alert.alert('Fatto', 'Zone salvate'); }
    catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Impossibile salvare le zone'); }
    finally { setSaving(false); }
  };

  const saveTest = async () => {
    if (!testTypeId || !testDate || !rawResult) return Alert.alert('Errore', 'Inserisci test, data e risultato');
    setSavingTest(true);
    try {
      const { data } = await api.post('/zones/tests/results', { athleteId: targetUserId, testTypeId, testDate, rawResult, notes: testNotes });
      const label = tests.find((test) => test.test_type_id === data.test_type_id)?.label;
      setResults((current) => [{ ...data, label }, ...current.filter((item) => item.test_type_id !== data.test_type_id)]); setSelectedResultId(data.test_result_id); setRawResult(''); setTestNotes('');
      const zoneResponse = await api.get('/zones', { params: { utenteId: targetUserId } }); setZones(normalizeZones(zoneResponse.data.zones));
      Alert.alert('Test salvato', 'Le zone sono state ricalcolate automaticamente.');
    } catch (e) { Alert.alert('Errore', e?.response?.data?.message || 'Impossibile salvare il test'); }
    finally { setSavingTest(false); }
  };

  const selectedTest = tests.find((test) => test.test_type_id === testTypeId);

  if (isCoach && !selectedAthlete) return <View style={styles.center}><Text style={typography.h2}>Seleziona un atleta</Text></View>;
  return <View style={styles.screen}>{isCoach && <AthletePicker />}{loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
    <Text style={typography.h2}>{isCoach ? `Zone di ${fullName(selectedAthlete)}` : 'Le mie zone'}</Text>
    <View style={styles.testPanel}><Text style={typography.h3}>Inserisci risultato test</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.testTypes}>{tests.map((test) => <Pressable key={test.test_type_id} onPress={() => setTestTypeId(test.test_type_id)} style={[styles.testChip, test.test_type_id === testTypeId && styles.testChipActive]}><Text style={[styles.testChipText, test.test_type_id === testTypeId && styles.testChipTextActive]}>{test.label}</Text></Pressable>)}</ScrollView><Text style={styles.label}>Data test</Text><DateField value={testDate} onChange={setTestDate} style={styles.testDateField} /><Text style={styles.label}>{selectedTest?.result_label || 'Risultato'}</Text><TextInput value={rawResult} onChangeText={setRawResult} style={styles.testInput} placeholder={selectedTest?.result_unit === 'css_pair' ? 'Tempo 400m-200m (MM:SS-MM:SS)' : selectedTest?.result_unit === 'time_mm_ss' || selectedTest?.result_unit === 'pace_mm_ss' ? 'Tempo (MM:SS)' : selectedTest?.result_unit === 'distance_m' ? 'Metri' : selectedTest?.result_unit === 'watt_avg' ? 'Watt' : 'Bpm'} /><TextInput value={testNotes} onChangeText={setTestNotes} style={styles.testInput} placeholder="Note test (facoltative)" /><Pressable style={styles.button} onPress={saveTest} disabled={savingTest}>{savingTest ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Salva test e calcola zone</Text>}</Pressable></View>
    {results.length > 0 && <View style={styles.section}><Text style={typography.h3}>Test registrati</Text>{results.slice(0, 5).map((result) => <Pressable key={result.test_result_id} onPress={() => { setSelectedResultId(result.test_result_id); setZones((current) => ({ ...current, ...normalizeZones(Object.fromEntries(Object.entries(typeof result.computed_zones === 'string' ? JSON.parse(result.computed_zones) : (result.computed_zones || {})).filter(([key]) => ZONE_UNITS[key]))) })); }} style={[styles.resultCard, selectedResultId === result.test_result_id && styles.resultCardActive]}><Text style={styles.result}>{result.label} · {result.raw_result} · {String(result.test_date).slice(0, 10)}</Text><Text style={styles.resultHint}>Tocca per rivedere le zone calcolate da questo test</Text></Pressable>)}</View>}
    {ZONE_GROUPS.map(({ key: group, label }) => <View key={group} style={styles.section}><Text style={typography.h3}>{label}</Text>{(zones[group] || []).map((zone, index) => <View style={styles.row} key={zone.key}>
      <View style={[styles.zoneSwatch, { backgroundColor: ZONE_COLORS[zone.key] || colors.border }]} /><Text style={styles.zoneKey}>{zone.key}</Text><Text style={styles.zoneName}>{zone.name}</Text><TextInput editable={isCoach} value={String(zone.min ?? '')} onChangeText={(v) => update(group, index, 'min', v)} placeholder="min" style={styles.input} /><TextInput editable={isCoach} value={String(zone.max ?? '')} onChangeText={(v) => update(group, index, 'max', v)} placeholder="max" style={styles.input} /><Text style={styles.unit}>{zone.unit || ZONE_UNITS[group]}</Text>
    </View>)}</View>)}
    {isCoach && <Pressable style={styles.button} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Salva zone</Text>}</Pressable>}
  </ScrollView>}</View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, testPanel: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }, testTypes: { gap: spacing.xs, paddingVertical: spacing.md }, testChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, testChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary }, testChipText: { color: colors.textMuted, fontSize: 12 }, testChipTextActive: { color: colors.primary, fontWeight: '700' }, label: { ...typography.caption, marginTop: spacing.sm, marginBottom: spacing.xs }, testDateField: { width: '100%', minWidth: 0 }, testInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surfaceAlt, marginBottom: spacing.xs }, section: { marginTop: spacing.xl }, resultCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs, backgroundColor: colors.surface }, resultCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight }, result: { ...typography.caption, paddingVertical: spacing.xs }, resultHint: { color: colors.primary, fontSize: 11 }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }, zoneKey: { width: 30, fontWeight: '800', color: colors.primary }, zoneSwatch: { width: 8, height: 22, borderRadius: 2 }, zoneName: { flex: 1, color: colors.text }, input: { width: 64, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.xs, backgroundColor: colors.surface }, unit: { width: 42, color: colors.textMuted, fontSize: 11 }, button: { marginTop: spacing.md, backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '700' } });