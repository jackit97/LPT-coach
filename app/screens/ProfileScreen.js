import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.screen}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{user?.nome?.[0]?.toUpperCase() || '?'}</Text></View>
      <Text style={typography.h2}>{user?.nome}</Text>
      <Text style={typography.caption}>{user?.email}</Text>
      <Text style={styles.role}>{user?.ruolo === 'personal_trainer' ? 'Coach' : 'Atleta'}</Text>

      <Pressable style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Esci</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', paddingTop: spacing.xxl * 2 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  avatarText: { color: colors.textInverse, fontSize: 32, fontWeight: '700' },
  role: { ...typography.caption, marginTop: spacing.sm, backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  logoutBtn: { marginTop: spacing.xxl, backgroundColor: '#FEE2E2', borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  logoutText: { color: colors.danger, fontWeight: '700' },
});
