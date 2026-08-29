import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert, Modal, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, typography } from '../theme';

export default function VideosScreen() {
  const { isCoach } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [titolo, setTitolo] = useState('');
  const [videourl, setVideourl] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/videos');
      setVideos(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const createVideo = async () => {
    if (!titolo || !videourl) return Alert.alert('Errore', 'Titolo e URL video sono richiesti');
    setSaving(true);
    try {
      await api.post('/videos', { titolo, videourl, descrizione });
      setModalOpen(false);
      setTitolo(''); setVideourl(''); setDescrizione('');
      await load();
    } catch (e) {
      Alert.alert('Errore', 'Impossibile aggiungere il video');
    } finally {
      setSaving(false);
    }
  };

  const deleteVideo = (id) => {
    Alert.alert('Elimina video', 'Sei sicuro?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => { await api.delete(`/videos/${id}`); load(); } },
    ]);
  };

  return (
    <View style={styles.screen}>
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => String(item.videoid)}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={<Text style={styles.empty}>Nessun video tutorial ancora.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(item.videourl)}>
                <Text style={typography.h3}>{item.titolo}</Text>
                {!!item.descrizione && <Text style={typography.caption}>{item.descrizione}</Text>}
                <Text style={styles.link}>{item.videourl}</Text>
              </Pressable>
              {isCoach && (
                <Pressable onPress={() => deleteVideo(item.videoid)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      {isCoach && (
        <Pressable style={styles.fab} onPress={() => setModalOpen(true)}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>Nuovo video tutorial</Text>
            <Text style={styles.fieldLabel}>Titolo</Text>
            <TextInput value={titolo} onChangeText={setTitolo} style={styles.input} placeholder="Tutorial Squat" />
            <Text style={styles.fieldLabel}>URL video</Text>
            <TextInput value={videourl} onChangeText={setVideourl} autoCapitalize="none" style={styles.input} placeholder="https://..." />
            <Text style={styles.fieldLabel}>Descrizione</Text>
            <TextInput value={descrizione} onChangeText={setDescrizione} style={[styles.input, styles.textArea]} multiline />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setModalOpen(false)}><Text style={styles.secondaryButtonText}>Annulla</Text></Pressable>
              <Pressable style={styles.primaryButton} onPress={createVideo} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.primaryButtonText}>Aggiungi</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  link: { color: colors.accent, marginTop: spacing.xs, fontSize: 12 },
  removeBtn: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.danger, fontWeight: '700' },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  fabText: { color: colors.textInverse, fontSize: 28, fontWeight: '700', marginTop: -2 },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flex: 1 },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  secondaryButton: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flex: 1 },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
});
