import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError('');
    if (!email || !password) return setError('Inserisci email e password');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e?.response?.data?.message || 'Credenziali non valide');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>LPT Coach</Text>
        <Text style={styles.heroSubtitle}>Il tuo calendario di allenamento, sempre a portata di mano</Text>
      </View>

      <View style={styles.card}>
        <Text style={typography.h2}>Accedi</Text>
        <View style={{ height: spacing.lg }} />

        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="nome@esempio.it"
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          style={styles.input}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.primaryButton} onPress={onSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Accedi</Text>}
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Register')} style={styles.linkWrap}>
          <Text style={styles.link}>Non hai un account? Registrati</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.primary },
  hero: { paddingHorizontal: spacing.xl, paddingTop: 80, paddingBottom: spacing.xxl },
  heroTitle: { fontSize: 32, fontWeight: '800', color: colors.textInverse },
  heroSubtitle: { fontSize: 14, color: '#C7D6F2', marginTop: spacing.sm },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg * 1.5,
    borderTopRightRadius: radius.lg * 1.5,
    padding: spacing.xl,
  },
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
