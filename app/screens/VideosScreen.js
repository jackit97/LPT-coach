import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Alert, Modal, Image, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { VideoPlayerModal } from '../components/VideoPlayer';
import ExercisePicker from '../components/ExercisePicker';
import { colors, spacing, radius, typography } from '../theme';
import { parseVideo } from '../utils/video';

const PROVIDER_LABELS = { youtube: 'YouTube', vimeo: 'Vimeo', stream: 'Cloudflare Stream', bunny: 'Bunny Stream', file: 'File video', unknown: 'Link esterno' };

export default function VideosScreen() {
  const { isCoach } = useAuth();
  const { width } = useWindowDimensions();
  const columns = width >= 1100 ? 3 : width >= 700 ? 2 : 1;
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [titolo, setTitolo] = useState('');
  const [videourl, setVideourl] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [saving, setSaving] = useState(false);
  const [exercise, setExercise] = useState(null); // { id, nome } esercizio del catalogo
  const [picker, setPicker] = useState(null); // 'new' | videoid da collegare/ricollegare

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/videos');
      setVideos(data || []);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((video) => !q || `${video.titolo} ${video.descrizione || ''}`.toLowerCase().includes(q));
  }, [videos, query]);

  const preview = parseVideo(videourl);

  const createVideo = async () => {
    if (!exercise) return Alert.alert('Esercizio', 'Scegli l\'esercizio a cui collegare il video');
    if (!videourl.trim()) return Alert.alert('Errore', 'Inserisci il link del video');
    setSaving(true);
    try {
      await api.post('/videos', {
        titolo: titolo.trim() || exercise.nome,
        videourl: videourl.trim(),
        descrizione,
        esercizioId: exercise.id || null,
        esercizioNome: exercise.id ? null : exercise.nome,
      });
      setModalOpen(false);
      setTitolo(''); setVideourl(''); setDescrizione(''); setExercise(null);
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile aggiungere il video');
    } finally {
      setSaving(false);
    }
  };

  const onPickExercise = async (item) => {
    const target = picker;
    setPicker(null);
    if (target === 'new') {
      setExercise(item);
      return;
    }
    try {
      await api.put(`/videos/${target}`, { esercizioId: item.id || null, esercizioNome: item.id ? null : item.nome });
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Collegamento non riuscito');
    }
  };

  const relinkVideo = videos.find((video) => video.videoid === picker);
  const unlinkVideo = async () => {
    const target = picker;
    setPicker(null);
    try {
      await api.put(`/videos/${target}`, { scollega: true });
      await load();
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Operazione non riuscita');
    }
  };

  const deleteVideo = (video) => {
    Alert.alert('Elimina video', `Eliminare "${video.titolo}"?`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => { await api.delete(`/videos/${video.videoid}`); load(); } },
    ]);
  };

  const renderItem = ({ item }) => {
    const info = parseVideo(item.videourl);
    return (
      <View style={[styles.cardWrap, { width: `${100 / columns}%` }]}>
        <View style={styles.card}>
          <Pressable style={styles.thumb} onPress={() => setPlaying(item)} accessibilityLabel={`Guarda ${item.titolo}`}>
            {info?.thumbnail ? <Image source={{ uri: info.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            <View style={styles.thumbShade} />
            <View style={styles.playCircle}><Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 3 }} /></View>
            <Text style={styles.provider}>{PROVIDER_LABELS[info?.kind || 'unknown']}</Text>
          </Pressable>
          <View style={styles.cardBody}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.titolo}</Text>
              {!!item.descrizione && <Text style={styles.cardDesc} numberOfLines={2}>{item.descrizione}</Text>}
              {item.esercizio_nome ? (
                <Pressable style={styles.linkRow} onPress={() => setPicker(item.videoid)} accessibilityLabel="Cambia esercizio collegato">
                  <Ionicons name="link" size={13} color={colors.success} />
                  <Text style={styles.linkText}>Esercizio: {item.esercizio_nome}</Text>
                  <View style={styles.changeChip}>
                    <Ionicons name="swap-horizontal" size={12} color={colors.primary} />
                    <Text style={styles.changeText}>Cambia</Text>
                  </View>
                </Pressable>
              ) : isCoach ? (
                <Pressable style={styles.linkRow} onPress={() => setPicker(item.videoid)}>
                  <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
                  <Text style={[styles.linkText, { color: colors.warning }]}>Non collegato · tocca per scegliere l'esercizio</Text>
                </Pressable>
              ) : null}
            </View>
            {isCoach && (
              <Pressable onPress={() => deleteVideo(item)} hitSlop={8} style={styles.deleteBtn} accessibilityLabel="Elimina video">
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Cerca video" style={styles.searchInput} />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <FlatList
          key={columns}
          data={filtered}
          numColumns={columns}
          keyExtractor={(item) => String(item.videoid)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{isCoach ? 'Nessun video. Premi + per aggiungere il primo tutorial.' : 'Il coach non ha ancora caricato video.'}</Text>}
        />
      )}

      {isCoach && (
        <Pressable style={styles.fab} onPress={() => setModalOpen(true)} accessibilityLabel="Aggiungi video">
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      )}

      <VideoPlayerModal url={playing?.videourl} title={playing?.titolo} visible={!!playing} onClose={() => setPlaying(null)} />

      {/* su iOS un popup va aperto dentro quello gia' visibile: due istanze, una per contesto */}
      <ExercisePicker
        visible={typeof picker === 'number'}
        title={relinkVideo?.esercizio_nome ? 'Cambia esercizio collegato' : 'Collega a un esercizio'}
        currentId={relinkVideo?.esercizioid}
        onUnlink={relinkVideo?.esercizioid ? unlinkVideo : undefined}
        onClose={() => setPicker(null)}
        onSelect={onPickExercise}
      />

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>Nuovo video tutorial</Text>
            <Text style={styles.fieldLabel}>Esercizio</Text>
            <Pressable style={[styles.input, styles.exerciseField]} onPress={() => setPicker('new')}>
              <Ionicons name="barbell-outline" size={18} color={exercise ? colors.primary : colors.textMuted} />
              <Text style={{ flex: 1, color: exercise ? colors.text : colors.textMuted, fontWeight: exercise ? '700' : '400' }}>{exercise ? exercise.nome : 'Scegli esercizio'}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>
            <Text style={styles.hint}>Il video comparirà con il tasto ▶ in tutte le schede e gli allenamenti con questo esercizio.</Text>
            <Text style={styles.fieldLabel}>Titolo (facoltativo)</Text>
            <TextInput value={titolo} onChangeText={setTitolo} style={styles.input} placeholder={exercise ? exercise.nome : 'Titolo'} />
            <Text style={styles.fieldLabel}>Link del video</Text>
            <TextInput value={videourl} onChangeText={setVideourl} autoCapitalize="none" style={styles.input} placeholder="Link video" />
            {!!videourl.trim() && (
              <Text style={[styles.hint, { color: preview?.kind === 'unknown' ? colors.warning : colors.success }]}>
                {preview?.kind === 'unknown' ? 'Link non riconosciuto: verrà aperto fuori dall\'app.' : `Riconosciuto: ${PROVIDER_LABELS[preview?.kind]} · si aprirà nel player dell'app`}
              </Text>
            )}
            <Text style={styles.fieldLabel}>Descrizione</Text>
            <TextInput value={descrizione} onChangeText={setDescrizione} style={[styles.input, styles.textArea]} multiline placeholder="Descrizione" />
            <ExercisePicker visible={picker === 'new'} onClose={() => setPicker(null)} onSelect={onPickExercise} />
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, margin: spacing.md, marginBottom: 0, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, maxWidth: 1100, alignSelf: 'center', width: '96%' },
  searchInput: { flex: 1, paddingVertical: spacing.sm },
  list: { padding: spacing.sm, paddingBottom: 100, maxWidth: 1120, width: '100%', alignSelf: 'center' },
  cardWrap: { padding: spacing.xs },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  thumb: { aspectRatio: 16 / 9, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  thumbShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  playCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(220,38,38,0.92)', alignItems: 'center', justifyContent: 'center' },
  provider: { position: 'absolute', left: 8, bottom: 8, color: '#fff', fontSize: 10, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  cardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deleteBtn: { padding: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  linkText: { fontSize: 12, fontWeight: '700', color: colors.success, flexShrink: 1 },
  changeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 6, borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  changeText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  exerciseField: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  empty: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
  fab: { position: 'absolute', right: spacing.xl, bottom: spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  fieldLabel: { ...typography.caption, marginTop: spacing.md, marginBottom: spacing.xs, fontWeight: '700' },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  primaryButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flex: 1 },
  primaryButtonText: { color: colors.textInverse, fontWeight: '700' },
  secondaryButton: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', flex: 1 },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
});
