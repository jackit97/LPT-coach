import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY_SECTIONS } from '../screens/PrivacyScreen';
import { colors, spacing, radius } from '../theme';

// Le due caselle obbligatorie (registrazione e primo accesso dopo l'aggiornamento) con l'informativa leggibile in un popup
export default function ConsentChecks({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (key) => onChange({ ...value, [key]: !value[key] });
  const Box = ({ checked, onPress, children, label }) => (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked && <Ionicons name="checkmark" size={16} color="#fff" />}</View>
      <Text style={styles.text}>{children}</Text>
    </Pressable>
  );
  return (
    <View>
      <Box checked={!!value.privacy} onPress={() => toggle('privacy')} label="Accetto informativa privacy e termini">
        Ho letto e accetto l'<Text style={styles.link} onPress={() => setOpen(true)}>informativa privacy e i termini d'uso</Text> *
      </Box>
      <Box checked={!!value.datiSalute} onPress={() => toggle('datiSalute')} label="Consenso dati sulla salute">
        Acconsento al trattamento dei miei dati sulla salute (peso, frequenza cardiaca, alimentazione, foto dei progressi) per il servizio di coaching (art. 9 GDPR) *
      </Box>
      <Text style={styles.required}>* obbligatori per usare l'app</Text>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Informativa privacy</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Chiudi"><Ionicons name="close" size={26} color={colors.textMuted} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
              {PRIVACY_SECTIONS.map(([heading, text]) => (
                <View key={heading} style={{ marginBottom: spacing.md }}>
                  <Text style={styles.heading}>{heading}</Text>
                  <Text style={styles.body}>{text}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.okBtn} onPress={() => { setOpen(false); if (!value.privacy) toggle('privacy'); }}>
              <Text style={styles.okText}>Ho letto, accetto</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1, backgroundColor: colors.surface },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  link: { color: colors.accent, fontWeight: '700', textDecorationLine: 'underline' },
  required: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  card: { width: '100%', maxWidth: 640, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  heading: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 2 },
  body: { fontSize: 13, color: colors.text, lineHeight: 19 },
  okBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  okText: { color: '#fff', fontWeight: '800' },
});
