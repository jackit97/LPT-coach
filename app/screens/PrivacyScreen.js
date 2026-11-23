import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

// Informativa privacy e termini d'uso. ATTENZIONE: i dati tra [parentesi quadre] vanno completati
// dal titolare del trattamento; per la versione definitiva e' consigliato il parere di un consulente privacy.
import PRIVACY from '../privacy.json';
// stesso testo pubblicato su /privacy.html (generato da scripts/prepare-web-pwa.js)
export const PRIVACY_SECTIONS = PRIVACY.it;

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Informativa privacy e termini d'uso</Text>
      <Text style={styles.meta}>Versione 2026-11 · ai sensi del Regolamento (UE) 2016/679 (GDPR)</Text>
      {PRIVACY_SECTIONS.map(([heading, text]) => (
        <React.Fragment key={heading}>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.body}>{text}</Text>
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 760, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  heading: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.lg, marginBottom: 4 },
  body: { fontSize: 14, color: colors.text, lineHeight: 21 },
});
