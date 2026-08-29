import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import api from '../api/client';
import { useAthlete } from '../context/AthleteContext';
import { colors, spacing, radius, typography } from '../theme';

export default function ClientsScreen({ navigation }) {
  const { clients, loadingClients, loadClients, selectedAthlete, setSelectedAthlete } = useAthlete();
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const addClient = async () => {
    if (!email) return;
    setAdding(true);
    try {
      await api.post('/users/clients', { email: email.trim() });
      setEmail('');
      await loadClients();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile collegare l\u2019atleta');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.addRow}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email atleta esistente"
          autoCapitalize="none"
          style={styles.input}
        />
        <Pressable style={styles.addBtn} onPress={addClient} disabled={adding}>
          {adding ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.addBtnText}>Aggiungi</Text>}
        </Pressable>
      </View>

      {loadingClients ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(item) => String(item.utenteid)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<Text style={styles.empty}>Nessun atleta collegato ancora.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, selectedAthlete?.utenteid === item.utenteid && styles.cardActive]}
              onPress={() => { setSelectedAthlete(item); navigation.goBack(); }}
            >
              <Text style={typography.h3}>{item.nome}</Text>
              <Text style={typography.caption}>{item.email}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  addRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceAlt },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: colors.textInverse, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
});
