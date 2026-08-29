import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ruolo, setRuolo] = useState('cliente');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError('');
    if (!nome || !email || !password) return setError('Compila tutti i campi');
    setLoading(true);
    try {
      await register(nome.trim(), email.trim(), password, ruolo);
    } catch (e) {
      setError(e?.response?.data?.message || 'Registrazione fallita');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={typography.h1}>Crea account</Text>
      <View style={{ height: spacing.lg }} />

      <Text style={styles.fieldLabel}>Nome</Text>
      <TextInput value={nome} onChangeText={setNome} style={styles.input} placeholder="Mario Rossi" />

      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="nome@esempio.it" />

      <Text style={styles.fieldLabel}>Password</Text>
      <TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} placeholder="••••••••" />

      <Text style={styles.fieldLabel}>Ruolo</Text>
      <View style={styles.roleRow}>
        <Pressable style={[styles.roleChip, ruolo === 'cliente' && styles.roleChipActive]} onPress={() => setRuolo('cliente')}>
          <Text style={[styles.roleChipText, ruolo === 'cliente' && styles.roleChipTextActive]}>Atleta</Text>
        </Pressable>
        <Pressable style={[styles.roleChip, ruolo === 'personal_trainer' && styles.roleChipActive]} onPress={() => setRuolo('personal_trainer')}>
          <Text style={[styles.roleChipText, ruolo === 'personal_trainer' && styles.roleChipTextActive]}>Coach</Text>
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.primaryButton} onPress={onSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Registrati</Text>}
      </Pressable>

      <Pressable onPress={() => navigation.goBack()} style={styles.linkWrap}>
        <Text style={styles.link}>Hai gia un account? Accedi</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingTop: spacing.xxl },
  fieldLabel: { ...typography.caption, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    backgroundColor: colors.surfaceAlt,
  },
  roleRow: { flexDirection: 'row', gap: spacing.sm },
  roleChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  roleChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  roleChipText: { fontWeight: '600', color: colors.textMuted },
  roleChipTextActive: { color: colors.primary },
  error: { color: colors.danger, marginTop: spacing.md },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700', fontSize: 15 },
  linkWrap: { marginTop: spacing.lg, alignItems: 'center' },
  link: { color: colors.accent, fontWeight: '600' },
});
