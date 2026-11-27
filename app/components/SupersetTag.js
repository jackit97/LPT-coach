import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SUPERSET_COLOR } from '../utils/superset';

// Etichetta "Superserie A1" sopra il nome dell'esercizio; sul primo del gruppo spiega come eseguirla
export default function SupersetTag({ info }) {
  if (!info) return null;
  return <View style={styles.row}>
    <Text style={styles.badge}>Superserie {info.label}</Text>
    {info.first && <Text style={styles.hint}>esercizi di seguito, recupero a fine giro</Text>}
  </View>;
}

export const supersetBorder = { borderLeftWidth: 4, borderLeftColor: SUPERSET_COLOR };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  badge: { color: '#fff', backgroundColor: SUPERSET_COLOR, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '800', overflow: 'hidden' },
  hint: { color: SUPERSET_COLOR, fontSize: 11, fontWeight: '600' },
});
