import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';

export default function TemplateDetailScreen({ route }) {
  const { template } = route.params;
  return <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
    <Text style={typography.h1}>{template.title}</Text>
    {!!template.notes && <Text style={styles.notes}>{template.notes}</Text>}
    <Text style={[typography.h3, styles.title]}>Sessioni</Text>
    {(template.sessions || []).map((item) => <View key={item.template_session_id} style={styles.card}>
      <Text style={typography.h3}>{item.title}</Text>
      <Text style={typography.caption}>{item.zone || '—'} · {item.duration_minutes} min · RPE {item.rpe_target || '—'}</Text>
      {!!item.target && <Text style={styles.notes}>Obiettivo: {item.target}</Text>}
      {!!item.description && <Text style={styles.notes}>{item.description}</Text>}
      {!!item.steps_text && <Text style={styles.notes}>{item.steps_text}</Text>}
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.bg }, title: { marginTop: spacing.xl, marginBottom: spacing.sm }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }, notes: { ...typography.body, marginTop: spacing.sm } });