import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import OptionPicker from '../components/OptionPicker';
import { ACTIVITY_LEVELS, CIRCUMFERENCES, PROTOCOLS, SKINFOLDS, computeAssessment, normalizeSex } from '../utils/bodyComposition';
import { colors, radius, spacing, typography } from '../theme';

const today = () => new Date().toISOString().slice(0, 10);
const text = (value) => (value === null || value === undefined ? '' : String(value).replace('.', ','));
const clean = (value) => String(value || '').replace(/[^0-9.,]/g, '').slice(0, 6);
const fmt = (value, digits = 1) => (value === null || value === undefined ? '—' : Number(value).toFixed(digits).replace('.', ','));

function NumberField({ label, value, onChange, unit, required, hint }) {
  return <View style={styles.field}>
    <Text style={[styles.fieldLabel, required && styles.fieldRequired]} numberOfLines={2}>{label}{required ? ' •' : ''}</Text>
    <View style={[styles.inputWrap, required && !value && styles.inputMissing]}>
      <TextInput value={value} onChangeText={(next) => onChange(clean(next))} keyboardType="decimal-pad" style={styles.input} />
      {!!unit && <Text style={styles.unit}>{unit}</Text>}
    </View>
    {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
  </View>;
}

export default function BodyAssessmentEditorScreen({ navigation, route }) {
  const { athleteId, athleteName, assessment, profilo, previous } = route.params || {};
  const source = assessment || null;
  const base = source || previous || {};
  const [data, setData] = useState(source?.data || today());
  const [sesso, setSesso] = useState(source?.sesso || profilo?.sesso || previous?.sesso || 'M');
  const [eta, setEta] = useState(text(source?.eta ?? profilo?.eta ?? previous?.eta));
  const [peso, setPeso] = useState(text(source?.peso_kg ?? profilo?.peso_kg));
  const [altezza, setAltezza] = useState(text(source?.altezza_cm ?? previous?.altezza_cm ?? profilo?.altezza_cm));
  const [protocollo, setProtocollo] = useState(base.protocollo || 'jp7');
  const [pal, setPal] = useState(Number(base.livello_attivita) || 1.55);
  const [obiettivo, setObiettivo] = useState(text(base.obiettivo_bf));
  const [pliche, setPliche] = useState(() => Object.fromEntries(SKINFOLDS.map((site) => [site.key, text(source?.pliche?.[site.key])])));
  const [circ, setCirc] = useState(() => Object.fromEntries(CIRCUMFERENCES.map((site) => [site.key, text(source?.circonferenze?.[site.key])])));
  const [note, setNote] = useState(source?.note || '');
  const [saving, setSaving] = useState(false);

  const required = useMemo(() => new Set(PROTOCOLS.find((p) => p.key === protocollo)?.sites(normalizeSex(sesso)) || []), [protocollo, sesso]);
  const preview = useMemo(() => computeAssessment({
    sesso, eta, peso_kg: peso, altezza_cm: altezza, protocollo, livello_attivita: pal, obiettivo_bf: obiettivo, pliche, circonferenze: circ,
  }), [sesso, eta, peso, altezza, protocollo, pal, obiettivo, pliche, circ]);

  const save = async () => {
    if (!data) return Alert.alert('Errore', 'Indica la data della valutazione');
    setSaving(true);
    const body = { utenteId: athleteId, data, sesso, eta, peso_kg: peso, altezza_cm: altezza, protocollo, livello_attivita: pal, obiettivo_bf: obiettivo, pliche, circonferenze: circ, note };
    try {
      if (source) await api.put(`/body/${source.assessment_id}`, body);
      else await api.post('/body', body);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Errore', error?.response?.data?.message || 'Impossibile salvare la valutazione');
    } finally {
      setSaving(false);
    }
  };

  const pairs = [];
  CIRCUMFERENCES.forEach((site) => {
    if (!site.pair) pairs.push([site]);
    else if (site.key.endsWith('_dx')) pairs.push([site, CIRCUMFERENCES.find((other) => other.key === site.key.replace(/_dx$/, '_sx'))]);
  });

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={typography.h2}>{source ? 'Modifica valutazione' : 'Nuova valutazione'}</Text>
    {!!athleteName && <Text style={typography.caption}>{athleteName}</Text>}

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Dati di base</Text>
      <Text style={styles.fieldLabel}>Data</Text>
      <DateField value={data} onChange={setData} style={{ width: '100%', minWidth: 0 }} />
      <Text style={[styles.fieldLabel, { marginTop: spacing.sm }]}>Sesso</Text>
      <View style={styles.chips}>
        {[['M', 'Uomo'], ['F', 'Donna']].map(([key, label]) => <Pressable key={key} onPress={() => setSesso(key)} style={[styles.chip, sesso === key && styles.chipActive]}><Text style={[styles.chipText, sesso === key && styles.chipTextActive]}>{label}</Text></Pressable>)}
      </View>
      <View style={styles.grid}>
        <NumberField label="Età" value={eta} onChange={setEta} unit="anni" />
        <NumberField label="Peso" value={peso} onChange={setPeso} unit="kg" />
        <NumberField label="Altezza" value={altezza} onChange={setAltezza} unit="cm" />
        <NumberField label="Obiettivo % grasso" value={obiettivo} onChange={setObiettivo} unit="%" />
      </View>
      <Text style={styles.fieldLabel}>Livello di attività (per il fabbisogno)</Text>
      <OptionPicker title="Livello di attività" value={pal} options={ACTIVITY_LEVELS.map((level) => ({ value: level.value, label: `${level.label} · ×${String(level.value).replace('.', ',')}` }))} onChange={setPal} style={styles.picker} />
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Pliche (mm)</Text>
      <Text style={styles.fieldLabel}>Formula per la % di grasso</Text>
      <View style={styles.chips}>
        {PROTOCOLS.map((p) => <Pressable key={p.key} onPress={() => setProtocollo(p.key)} style={[styles.chip, protocollo === p.key && styles.chipActive]}><Text style={[styles.chipText, protocollo === p.key && styles.chipTextActive]}>{p.label}</Text></Pressable>)}
      </View>
      <Text style={styles.hint}>Le pliche con • servono alla formula scelta. Misura sul lato destro; puoi inserire anche le altre per la mappa del grasso.</Text>
      <View style={styles.grid}>
        {SKINFOLDS.map((site) => <NumberField key={site.key} label={site.label} value={pliche[site.key]} required={required.has(site.key)} unit="mm" onChange={(value) => setPliche((current) => ({ ...current, [site.key]: value }))} />)}
      </View>
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Circonferenze (cm)</Text>
      <Text style={styles.hint}>Collo e vita (e fianchi per le donne) servono per il metodo US Navy; braccio, coscia e polpaccio per la massa muscolare.</Text>
      {pairs.map((group) => <View key={group[0].key} style={styles.grid}>
        {group.map((site) => <NumberField key={site.key} label={site.label} value={circ[site.key]} unit="cm" onChange={(value) => setCirc((current) => ({ ...current, [site.key]: value }))} />)}
      </View>)}
    </View>

    <View style={styles.card}>
      <Text style={styles.cardTitle}>Note per l'atleta</Text>
      <TextInput value={note} onChangeText={setNote} multiline style={[styles.input, styles.noteInput]} />
    </View>

    <View style={styles.preview}>
      <Text style={styles.previewTitle}>Anteprima stime</Text>
      {preview.missing.length > 0 && <Text style={styles.previewMissing}>Mancano: {preview.missing.join(', ')}</Text>}
      <View style={styles.previewGrid}>
        {[
          ['% grasso', preview.massa_grassa_pct !== null ? `${fmt(preview.massa_grassa_pct)}%` : '—', preview.metodo?.label],
          ['Massa grassa', preview.massa_grassa_kg !== null ? `${fmt(preview.massa_grassa_kg)} kg` : '—'],
          ['Massa magra', preview.massa_magra_kg !== null ? `${fmt(preview.massa_magra_kg)} kg` : '—'],
          ['Massa muscolare', preview.massa_muscolare_kg !== null ? `${fmt(preview.massa_muscolare_kg)} kg` : '—'],
          ['Basale', preview.metabolismo.basale ? `${fmt(preview.metabolismo.basale, 0)} kcal` : '—'],
          ['Fabbisogno', preview.metabolismo.totale ? `${fmt(preview.metabolismo.totale, 0)} kcal` : '—'],
        ].map(([label, value, sub]) => <View key={label} style={styles.previewItem}>
          <Text style={styles.previewLabel}>{label}</Text>
          <Text style={styles.previewValue}>{value}</Text>
          {!!sub && <Text style={styles.previewSub}>{sub}</Text>}
        </View>)}
      </View>
    </View>

    <View style={styles.actions}>
      <Pressable style={styles.cancel} onPress={() => navigation.goBack()} disabled={saving}><Text style={styles.cancelText}>Annulla</Text></Pressable>
      <Pressable style={styles.save} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{source ? 'Salva modifiche' : 'Salva valutazione'}</Text>}</Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, maxWidth: 900, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  field: { flexBasis: '46%', flexGrow: 1, minWidth: 130 },
  fieldLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginBottom: 4 },
  fieldRequired: { color: colors.primary, fontWeight: '800' },
  fieldHint: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, paddingRight: spacing.sm },
  inputMissing: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  input: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm, paddingVertical: 9, fontSize: 15, color: colors.text },
  unit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  noteInput: { minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  chipTextActive: { color: '#fff' },
  hint: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  picker: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surfaceAlt },
  preview: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md },
  previewTitle: { color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: spacing.xs },
  previewMissing: { color: '#FDE68A', fontSize: 12, marginBottom: spacing.xs },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  previewItem: { flexBasis: '30%', flexGrow: 1, minWidth: 100, backgroundColor: '#ffffff1f', borderRadius: radius.sm, padding: spacing.sm },
  previewLabel: { color: '#C7D7F5', fontSize: 11, fontWeight: '700' },
  previewValue: { color: '#fff', fontSize: 17, fontWeight: '800' },
  previewSub: { color: '#C7D7F5', fontSize: 10 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  cancel: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.text, fontWeight: '700' },
  save: { flex: 2, backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800' },
});
