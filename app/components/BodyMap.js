import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

// Sagoma frontale schematica (solo View). Il lato destro dell'atleta e' a sinistra di chi guarda.
const W = 240;
const H = 430;
const SKIN = '#E7ECF3';

const PARTS = [
  { key: 'head', left: 96, top: 6, width: 48, height: 54, radius: 24 },
  { key: 'neck', left: 110, top: 56, width: 20, height: 16, radius: 6 },
  { key: 'torso', left: 76, top: 68, width: 88, height: 140, radius: 26 },
  { key: 'pelvis', left: 78, top: 196, width: 84, height: 46, radius: 18 },
  { key: 'arm_r', group: 'braccio', side: 'dx', left: 50, top: 74, width: 26, height: 92, radius: 13 },
  { key: 'arm_l', group: 'braccio', side: 'sx', left: 164, top: 74, width: 26, height: 92, radius: 13 },
  { key: 'forearm_r', left: 44, top: 162, width: 22, height: 82, radius: 11 },
  { key: 'forearm_l', left: 174, top: 162, width: 22, height: 82, radius: 11 },
  { key: 'thigh_r', group: 'coscia', side: 'dx', left: 80, top: 232, width: 36, height: 100, radius: 16 },
  { key: 'thigh_l', group: 'coscia', side: 'sx', left: 124, top: 232, width: 36, height: 100, radius: 16 },
  { key: 'calf_r', group: 'polpaccio', side: 'dx', left: 84, top: 336, width: 28, height: 86, radius: 13 },
  { key: 'calf_l', group: 'polpaccio', side: 'sx', left: 128, top: 336, width: 28, height: 86, radius: 13 },
];

// posizione dei punti di plica (centro del cerchio)
const SITES = {
  pettorale: [100, 92],
  ascellare: [84, 124],
  bicipite: [70, 104],
  tricipite: [54, 128],
  sottoscapolare: [148, 108],
  addominale: [128, 166],
  sovrailiaca: [86, 196],
  coscia: [98, 280],
  polpaccio: [98, 374],
};

export const fatColor = (index) => (index >= 1.25 ? '#DC2626' : index >= 0.9 ? '#F59E0B' : '#16A34A');

export default function BodyMap({ mode = 'grasso', results }) {
  const fat = results?.distribuzione_grasso || [];
  const muscle = Object.fromEntries((results?.muscolo || []).map((site) => [site.key, site]));
  const maxMm = Math.max(1, ...fat.map((site) => site.mm));

  const tint = (part) => {
    if (mode !== 'muscolo' || !part.group || !muscle[part.group]) return SKIN;
    const site = muscle[part.group];
    // lato con circonferenza maggiore piu' scuro
    if (site.lato_maggiore && site.lato_maggiore === part.side) return '#7C3AED';
    if (site.lato_maggiore) return '#C4B5FD';
    return '#A78BFA';
  };

  return (
    <View style={styles.wrap}>
      <View style={{ width: W, height: H }}>
        {PARTS.map((part) => <View key={part.key} style={{ position: 'absolute', left: part.left, top: part.top, width: part.width, height: part.height, borderRadius: part.radius, backgroundColor: tint(part) }} />)}
        <Text style={[styles.side, { left: 0 }]}>DX</Text>
        <Text style={[styles.side, { right: 0 }]}>SX</Text>

        {mode === 'grasso' && fat.map((site) => {
          const pos = SITES[site.key];
          if (!pos) return null;
          const size = 14 + (site.mm / maxMm) * 18;
          const color = fatColor(site.indice);
          return <View key={site.key} pointerEvents="none" style={{ position: 'absolute', left: pos[0] - size / 2, top: pos[1] - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}CC`, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={styles.dotText}>{Math.round(site.mm)}</Text>
          </View>;
        })}

        {mode === 'muscolo' && ['braccio', 'coscia', 'polpaccio'].map((key) => {
          const site = muscle[key];
          if (!site) return null;
          const part = PARTS.find((p) => p.group === key && p.side === 'sx');
          return <View key={key} style={[styles.muscleLabel, { left: part.left + part.width + 4, top: part.top + part.height / 2 - 16 }]}>
            <Text style={styles.muscleValue}>{site.circonferenza_muscolare ?? site.circonferenza} cm</Text>
            {site.asimmetria_pct !== null && Math.abs(site.asimmetria_pct) >= 1 && <Text style={styles.muscleHint}>{site.lato_maggiore} +{Math.abs(site.asimmetria_pct).toFixed(1).replace('.', ',')}%</Text>}
          </View>;
        })}
      </View>
      {mode === 'grasso'
        ? <View style={styles.legend}>
          {[['#DC2626', 'Grasso localizzato (sopra la tua media)'], ['#F59E0B', 'Nella tua media'], ['#16A34A', 'Sotto la tua media']].map(([color, label]) => <View key={label} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>)}
          <Text style={styles.legendNote}>Il numero è lo spessore della plica in mm; il cerchio è più grande dove la plica è più spessa.</Text>
        </View>
        : <View style={styles.legend}>
          {[['#7C3AED', 'Lato con più muscolo'], ['#C4B5FD', 'Lato con meno muscolo'], ['#A78BFA', 'Lati simili (differenza < 1%)']].map(([color, label]) => <View key={label} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>)}
          <Text style={styles.legendNote}>Circonferenza muscolare = circonferenza meno lo spessore della plica (stima di muscolo + osso).</Text>
        </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  side: { position: 'absolute', top: 8, fontSize: 11, fontWeight: '800', color: colors.textMuted },
  dotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  muscleLabel: { position: 'absolute', backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: '#DDD6FE' },
  muscleValue: { fontSize: 10, fontWeight: '800', color: '#5B21B6' },
  muscleHint: { fontSize: 9, color: '#6D28D9' },
  legend: { alignSelf: 'stretch', marginTop: spacing.sm, gap: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, color: colors.text },
  legendNote: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
