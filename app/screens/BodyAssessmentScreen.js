import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAthlete } from '../context/AthleteContext';
import AthletePicker from '../components/AthletePicker';
import TrendChart from '../components/TrendChart';
import BodyMap from '../components/BodyMap';
import { CIRCUMFERENCES, SKINFOLDS } from '../utils/bodyComposition';
import { colors, radius, spacing, typography } from '../theme';

const fmt = (value, digits = 1) => (value === null || value === undefined || value === '' ? '—' : Number(value).toFixed(digits).replace('.', ','));
const dayLabel = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y.slice(2)}`; };
const longDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

// metriche per il grafico di andamento: [chiave, etichetta, unita', lettura, cifre, meno = meglio]
const TREND_METRICS = [
  ['peso', 'Peso', 'kg', (v) => v.peso_kg, 1, false],
  ['bf', '% grasso', '%', (v) => v.risultati.massa_grassa_pct, 1, true],
  ['fm', 'Massa grassa', 'kg', (v) => v.risultati.massa_grassa_kg, 1, true],
  ['ffm', 'Massa magra', 'kg', (v) => v.risultati.massa_magra_kg, 1, false],
  ['smm', 'Massa muscolare', 'kg', (v) => v.risultati.massa_muscolare_kg, 1, false],
  ['sum', 'Somma pliche', 'mm', (v) => v.risultati.somma_pliche, 0, true],
  ['bmr', 'Metabolismo basale', 'kcal', (v) => v.risultati.metabolismo?.basale, 0, false],
];

function Delta({ value, unit, lowerIsBetter, digits = 1 }) {
  if (value === null || value === undefined) return null;
  if (Math.abs(value) < 0.05) return <Text style={[styles.delta, { color: colors.textMuted }]}>= invariato</Text>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  return <Text style={[styles.delta, { color: good ? colors.success : colors.danger }]}>{value > 0 ? '▲' : '▼'} {fmt(Math.abs(value), digits)} {unit}</Text>;
}

function Stat({ label, value, unit, sub, color, delta }) {
  return <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, color && { color }]}>{value}<Text style={styles.statUnit}>{unit ? ` ${unit}` : ''}</Text></Text>
    {!!sub && <Text style={styles.statSub}>{sub}</Text>}
    {delta}
  </View>;
}

function Section({ title, icon, children, right }) {
  return <View style={styles.card}>
    <View style={styles.cardHeader}>
      {!!icon && <Ionicons name={icon} size={18} color={colors.primary} />}
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
    {children}
  </View>;
}

function Chip({ active, label, onPress }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

export default function BodyAssessmentScreen({ navigation, route }) {
  const { isCoach } = useAuth();
  const { targetUserId, selectedAthlete } = useAthlete();
  const [data, setData] = useState({ profilo: null, valutazioni: [] });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(route?.params?.assessmentId || null);
  const [mapMode, setMapMode] = useState('grasso');
  const [trend, setTrend] = useState('peso');

  const load = useCallback(async () => {
    if (!targetUserId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: response } = await api.get('/body', { params: isCoach ? { utenteId: targetUserId } : {} });
      setData(response || { profilo: null, valutazioni: [] });
    } catch (error) {
      Alert.alert('Errore', error?.response?.data?.message || 'Impossibile caricare le valutazioni');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, isCoach]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const list = data.valutazioni || [];
  const current = list.find((item) => item.assessment_id === selectedId) || list[list.length - 1] || null;
  const r = current?.risultati || {};
  const cmp = current?.confronto || null;

  const trendOptions = useMemo(() => {
    const base = TREND_METRICS.filter(([, , , read]) => list.some((item) => read(item) !== null && read(item) !== undefined));
    const circ = CIRCUMFERENCES.filter((site) => list.some((item) => item.circonferenze?.[site.key])).map((site) => [`c:${site.key}`, site.label, 'cm', (v) => v.circonferenze?.[site.key] ?? null, 1, site.key === 'vita' || site.key === 'addome' || site.key === 'fianchi']);
    const folds = SKINFOLDS.filter((site) => list.some((item) => item.pliche?.[site.key])).map((site) => [`p:${site.key}`, `Plica ${site.label.toLowerCase()}`, 'mm', (v) => v.pliche?.[site.key] ?? null, 1, true]);
    return [...base, ...circ, ...folds];
  }, [list]);
  const activeTrend = trendOptions.find(([key]) => key === trend) || trendOptions[0];

  const confirmDelete = () => {
    const run = async () => {
      try { await api.delete(`/body/${current.assessment_id}`); setSelectedId(null); load(); }
      catch (error) { Alert.alert('Errore', error?.response?.data?.message || 'Impossibile eliminare'); }
    };
    const text = `Eliminare la valutazione del ${longDay(current.data)}? Non si può annullare.`;
    if (Platform.OS === 'web') { if (window.confirm(text)) run(); return; }
    Alert.alert('Elimina valutazione', text, [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: run }]);
  };

  const openEditor = (assessment) => navigation.navigate('BodyEditor', { athleteId: targetUserId, athleteName: data.profilo?.nome || selectedAthlete?.nome, assessment: assessment || null, profilo: data.profilo, previous: list[list.length - 1] || null });

  const topFat = (r.distribuzione_grasso || []).filter((site) => site.indice >= 1.1).slice(0, 3);
  const bfColor = r.categoria_grasso?.color || colors.primary;
  const fatShare = r.massa_grassa_pct;
  const muscleShare = r.massa_muscolare_pct;

  return <View style={styles.screen}>
    {isCoach && <AthletePicker />}
    {loading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} /> : (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={typography.h2}>Valutazione corporea</Text>
            <Text style={typography.caption}>{isCoach ? `Plicometria e misure di ${data.profilo?.nome || 'atleta'}` : 'Le tue misure, la composizione corporea e l\'andamento nel tempo'}</Text>
          </View>
          {isCoach && <Pressable style={styles.addBtn} onPress={() => openEditor(null)}><Ionicons name="add" size={18} color="#fff" /><Text style={styles.addText}>Nuova</Text></Pressable>}
        </View>

        {!current ? (
          <View style={styles.empty}>
            <Ionicons name="body-outline" size={44} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Nessuna valutazione</Text>
            <Text style={styles.emptyText}>{isCoach ? 'Inserisci pliche e circonferenze con «Nuova»: l\'app stima massa grassa, massa magra, muscolo e metabolismo.' : 'Quando il coach registra le tue misure le trovi qui, con risultati e grafici.'}</Text>
          </View>
        ) : <>
          {list.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dates}>
            {[...list].reverse().map((item) => <Chip key={item.assessment_id} active={item.assessment_id === current.assessment_id} label={dayLabel(item.data)} onPress={() => setSelectedId(item.assessment_id)} />)}
          </ScrollView>}

          <View style={styles.headCard}>
            <Text style={styles.headDate}>{longDay(current.data)}</Text>
            <Text style={styles.headMeta}>{[r.metodo?.label, current.eta && `${current.eta} anni`, current.altezza_cm && `${fmt(current.altezza_cm, 0)} cm`].filter(Boolean).join(' · ')}</Text>
            {cmp && <Text style={styles.headMeta}>Confronto con il {longDay(cmp.data_precedente)}</Text>}
            {isCoach && <View style={styles.headActions}>
              <Pressable style={styles.smallBtn} onPress={() => openEditor(current)}><Ionicons name="create-outline" size={16} color={colors.primary} /><Text style={styles.smallBtnText}>Modifica</Text></Pressable>
              <Pressable style={[styles.smallBtn, styles.smallBtnDanger]} onPress={confirmDelete}><Ionicons name="trash-outline" size={16} color={colors.danger} /><Text style={[styles.smallBtnText, { color: colors.danger }]}>Elimina</Text></Pressable>
            </View>}
          </View>

          {r.missing?.length > 0 && <Text style={styles.warning}>Per tutte le stime mancano: {r.missing.join(', ')}.</Text>}

          <View style={styles.stats}>
            <Stat label="Peso" value={fmt(current.peso_kg)} unit="kg" delta={<Delta value={cmp?.peso_kg} unit="kg" />} />
            <Stat label="Massa grassa" value={fmt(r.massa_grassa_pct)} unit="%" color={bfColor} sub={r.categoria_grasso?.label} delta={<Delta value={cmp?.massa_grassa_pct} unit="%" lowerIsBetter />} />
            <Stat label="Massa grassa" value={fmt(r.massa_grassa_kg)} unit="kg" delta={<Delta value={cmp?.massa_grassa_kg} unit="kg" lowerIsBetter />} />
            <Stat label="Massa magra" value={fmt(r.massa_magra_kg)} unit="kg" delta={<Delta value={cmp?.massa_magra_kg} unit="kg" />} />
            <Stat label="Massa muscolare" value={fmt(r.massa_muscolare_kg)} unit="kg" sub={r.massa_muscolare_pct ? `${fmt(r.massa_muscolare_pct)}% del peso` : 'servono braccio, coscia e polpaccio'} delta={<Delta value={cmp?.massa_muscolare_kg} unit="kg" />} />
            <Stat label="Metabolismo basale" value={fmt(r.metabolismo?.basale, 0)} unit="kcal" sub={r.metabolismo?.totale ? `Fabbisogno ~${fmt(r.metabolismo.totale, 0)} kcal/giorno` : null} />
          </View>

          {fatShare !== null && fatShare !== undefined && <Section title="Composizione" icon="pie-chart-outline">
            <View style={styles.bar}>
              <View style={{ flex: fatShare, backgroundColor: '#F59E0B' }} />
              {muscleShare ? <>
                <View style={{ flex: muscleShare, backgroundColor: '#7C3AED' }} />
                <View style={{ flex: Math.max(0, 100 - fatShare - muscleShare), backgroundColor: '#60A5FA' }} />
              </> : <View style={{ flex: 100 - fatShare, backgroundColor: '#60A5FA' }} />}
            </View>
            <View style={styles.barLegend}>
              <Text style={styles.barItem}><Text style={{ color: '#F59E0B' }}>■</Text> Grasso {fmt(fatShare)}%</Text>
              {muscleShare ? <Text style={styles.barItem}><Text style={{ color: '#7C3AED' }}>■</Text> Muscolo {fmt(muscleShare)}%</Text> : null}
              <Text style={styles.barItem}><Text style={{ color: '#60A5FA' }}>■</Text> {muscleShare ? 'Ossa, organi, acqua' : 'Massa magra'} {fmt(100 - fatShare - (muscleShare || 0))}%</Text>
            </View>
          </Section>}

          <Section title="Mappa del corpo" icon="body-outline" right={<View style={styles.toggle}>
            <Chip active={mapMode === 'grasso'} label="Grasso" onPress={() => setMapMode('grasso')} />
            <Chip active={mapMode === 'muscolo'} label="Muscolo" onPress={() => setMapMode('muscolo')} />
          </View>}>
            {(mapMode === 'grasso' ? r.distribuzione_grasso?.length : r.muscolo?.length) ? <BodyMap mode={mapMode} results={r} /> : <Text style={styles.muted}>{mapMode === 'grasso' ? 'Nessuna plica registrata.' : 'Servono le circonferenze di braccio, coscia o polpaccio.'}</Text>}
            {mapMode === 'grasso' && topFat.length > 0 && <View style={styles.highlight}>
              <Text style={styles.highlightTitle}>Punti di grasso localizzato</Text>
              {topFat.map((site) => <Text key={site.key} style={styles.highlightRow}>• {site.label}: {fmt(site.mm)} mm ({site.quota}% del totale{cmp?.pliche?.[site.key] !== null && cmp?.pliche?.[site.key] !== undefined ? `, ${cmp.pliche[site.key] > 0 ? '+' : ''}${fmt(cmp.pliche[site.key])} mm` : ''})</Text>)}
            </View>}
            {mapMode === 'grasso' && r.regioni_grasso?.length > 0 && <View style={styles.regions}>
              {r.regioni_grasso.map((region) => <View key={region.region} style={styles.region}><Text style={styles.regionLabel}>{region.region}</Text><Text style={styles.regionValue}>{fmt(region.media_mm)} mm</Text><Text style={styles.regionHint}>media di {region.siti} {region.siti === 1 ? 'plica' : 'pliche'}</Text></View>)}
            </View>}
            {mapMode === 'muscolo' && r.muscolo?.length > 0 && <View style={{ marginTop: spacing.sm }}>
              {r.muscolo.map((site) => <View key={site.key} style={styles.tableRow}>
                <Text style={[styles.cell, { flex: 1.2, fontWeight: '700' }]}>{site.label}</Text>
                <Text style={styles.cell}>{fmt(site.circonferenza)} cm</Text>
                <Text style={styles.cell}>{site.circonferenza_muscolare ? `${fmt(site.circonferenza_muscolare)} cm musc.` : '—'}</Text>
                <Text style={styles.cell}>{site.area_muscolare_cm2 ? `${fmt(site.area_muscolare_cm2, 0)} cm²` : '—'}</Text>
              </View>)}
              <Text style={styles.muted}>Area muscolare del braccio corretta per l'osso (Heymsfield). Le asimmetrie confrontano destra e sinistra.</Text>
            </View>}
          </Section>

          {trendOptions.length > 0 && <Section title="Andamento" icon="trending-up-outline">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendChips}>
              {trendOptions.map(([key, label]) => <Chip key={key} active={activeTrend?.[0] === key} label={label} onPress={() => setTrend(key)} />)}
            </ScrollView>
            {activeTrend && <TrendChart
              points={list.map((item) => ({ label: dayLabel(item.data), value: activeTrend[3](item) }))}
              unit={activeTrend[2]} digits={activeTrend[4]} lowerIsBetter={activeTrend[5]}
              color={activeTrend[5] ? '#F59E0B' : colors.primary}
            />}
          </Section>}

          <Section title="Indici" icon="analytics-outline">
            <View style={styles.indexGrid}>
              <Stat label="BMI" value={fmt(r.bmi)} sub={r.bmi_categoria} />
              <Stat label="FFMI" value={fmt(r.ffmi)} sub={r.ffmi_normalizzato ? `normalizzato ${fmt(r.ffmi_normalizzato)}` : 'indice di massa magra'} />
              <Stat label="Vita / fianchi" value={fmt(r.vita_fianchi, 2)} sub={r.vita_fianchi_rischio ? `rischio ${r.vita_fianchi_rischio.toLowerCase()}` : null} />
              <Stat label="Vita / altezza" value={fmt(r.vita_altezza, 2)} sub={r.vita_altezza_rischio ? `rischio ${r.vita_altezza_rischio.toLowerCase()}` : null} />
              <Stat label="Somma pliche" value={fmt(r.somma_pliche, 0)} unit="mm" sub={r.pliche_misurate ? `${r.pliche_misurate} pliche` : null} delta={<Delta value={cmp?.somma_pliche} unit="mm" lowerIsBetter digits={0} />} />
              <Stat label="Struttura ossea" value={r.struttura_ossea || '—'} sub="da altezza e polso" />
            </View>
            {r.peso_obiettivo_kg && <Text style={styles.targetText}>Con la massa magra attuale, al {fmt(r.obiettivo_bf)}% di grasso il peso sarebbe circa <Text style={{ fontWeight: '800' }}>{fmt(r.peso_obiettivo_kg)} kg</Text>.</Text>}
          </Section>

          {r.metodi?.length > 0 && <Section title="% grasso con i diversi metodi" icon="calculator-outline">
            {r.metodi.map((method) => <View key={method.key} style={styles.tableRow}>
              <Text style={[styles.cell, { flex: 2, fontWeight: method.key === r.metodo?.key ? '800' : '500' }]}>{method.label}{method.key === r.metodo?.key ? ' (usato)' : ''}</Text>
              <Text style={[styles.cell, { textAlign: 'right', fontWeight: '800', color: colors.text }]}>{fmt(method.bf)}%</Text>
            </View>)}
            <Text style={styles.muted}>Le stime variano di qualche punto tra un metodo e l'altro: per seguire i progressi conta usare sempre lo stesso.</Text>
          </Section>}

          {r.metabolismo?.basale && <Section title="Metabolismo" icon="flame-outline">
            {[['Katch-McArdle (massa magra)', r.metabolismo.katch_mcardle], ['Cunningham (massa magra)', r.metabolismo.cunningham], ['Mifflin-St Jeor', r.metabolismo.mifflin], ['Harris-Benedict', r.metabolismo.harris_benedict]].filter(([, value]) => value).map(([label, value]) => <View key={label} style={styles.tableRow}><Text style={[styles.cell, { flex: 2 }]}>{label}</Text><Text style={[styles.cell, { textAlign: 'right', fontWeight: '700' }]}>{fmt(value, 0)} kcal</Text></View>)}
            <View style={[styles.tableRow, { borderBottomWidth: 0 }]}><Text style={[styles.cell, { flex: 2, fontWeight: '800' }]}>Fabbisogno giornaliero (× {fmt(r.metabolismo.livello_attivita, 2)})</Text><Text style={[styles.cell, { textAlign: 'right', fontWeight: '800', color: colors.primary }]}>{fmt(r.metabolismo.totale, 0)} kcal</Text></View>
            <Text style={styles.muted}>Basale calcolato con {r.metabolismo.fonte_basale}. È una stima: va verificata con l'andamento del peso.</Text>
          </Section>}

          <Section title="Misure" icon="resize-outline">
            <Text style={styles.subTitle}>Pliche (mm)</Text>
            {SKINFOLDS.filter((site) => current.pliche?.[site.key]).map((site) => <View key={site.key} style={styles.tableRow}>
              <Text style={[styles.cell, { flex: 2 }]}>{site.label}</Text>
              <Text style={[styles.cell, { textAlign: 'right', fontWeight: '700' }]}>{fmt(current.pliche[site.key])}</Text>
              <View style={{ flex: 1, alignItems: 'flex-end' }}><Delta value={cmp?.pliche?.[site.key]} unit="" lowerIsBetter /></View>
            </View>)}
            {!SKINFOLDS.some((site) => current.pliche?.[site.key]) && <Text style={styles.muted}>Nessuna plica.</Text>}
            <Text style={[styles.subTitle, { marginTop: spacing.md }]}>Circonferenze (cm)</Text>
            {CIRCUMFERENCES.filter((site) => current.circonferenze?.[site.key]).map((site) => <View key={site.key} style={styles.tableRow}>
              <Text style={[styles.cell, { flex: 2 }]}>{site.label}</Text>
              <Text style={[styles.cell, { textAlign: 'right', fontWeight: '700' }]}>{fmt(current.circonferenze[site.key])}</Text>
              <View style={{ flex: 1, alignItems: 'flex-end' }}><Delta value={cmp?.circonferenze?.[site.key]} unit="" lowerIsBetter={['vita', 'addome', 'fianchi'].includes(site.key)} /></View>
            </View>)}
            {!CIRCUMFERENCES.some((site) => current.circonferenze?.[site.key]) && <Text style={styles.muted}>Nessuna circonferenza.</Text>}
          </Section>

          {!!current.note && <Section title="Note del coach" icon="chatbox-ellipses-outline"><Text style={styles.note}>{current.note}</Text></Section>}
        </>}
      </ScrollView>
    )}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, maxWidth: 900, width: '100%', alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addText: { color: '#fff', fontWeight: '800' },
  empty: { alignItems: 'center', padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { ...typography.h3, marginTop: spacing.sm },
  emptyText: { ...typography.caption, textAlign: 'center', marginTop: 4 },
  dates: { gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  headCard: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md },
  headDate: { color: '#fff', fontSize: 18, fontWeight: '800', textTransform: 'capitalize' },
  headMeta: { color: '#C7D7F5', fontSize: 12, marginTop: 2 },
  headActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  smallBtnDanger: { backgroundColor: '#FEE2E2' },
  smallBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  warning: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: radius.sm, padding: spacing.sm, fontSize: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexBasis: '31%', flexGrow: 1, minWidth: 140, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  statUnit: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  statSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  delta: { fontSize: 12, fontWeight: '800', marginTop: 2 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  toggle: { flexDirection: 'row', gap: 4 },
  bar: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden' },
  barLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  barItem: { fontSize: 12, color: colors.text, fontWeight: '600' },
  muted: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  highlight: { marginTop: spacing.md, backgroundColor: '#FEF2F2', borderRadius: radius.sm, padding: spacing.sm },
  highlightTitle: { fontWeight: '800', color: '#991B1B', marginBottom: 2 },
  highlightRow: { color: '#7F1D1D', fontSize: 13 },
  regions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  region: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' },
  regionLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  regionValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  regionHint: { fontSize: 10, color: colors.textMuted },
  trendChips: { gap: spacing.xs, paddingBottom: spacing.sm },
  indexGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  targetText: { marginTop: spacing.sm, color: colors.text, fontSize: 13 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.xs },
  cell: { flex: 1, fontSize: 13, color: colors.text },
  subTitle: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  note: { fontSize: 14, color: colors.text, fontWeight: '700', lineHeight: 20 },
});
