import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, TextInput, Image, Modal, Platform, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { pickPhoto } from '../utils/photos';
import { CHECK_STATUS, fmtDate } from './ChecksScreen';
import { colors, spacing, radius, typography } from '../theme';

const POSES = [
  { key: 'fronte', label: 'Fronte', icon: 'body-outline' },
  { key: 'lato', label: 'Lato', icon: 'swap-horizontal-outline' },
  { key: 'retro', label: 'Retro', icon: 'return-up-back-outline' },
];

export default function CheckDetailScreen({ route }) {
  const { checkId } = route.params;
  const { isCoach } = useAuth();
  const { width } = useWindowDimensions();
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyPose, setBusyPose] = useState(null);
  const [nota, setNota] = useState('');
  const [peso, setPeso] = useState('');
  const [commento, setCommento] = useState('');
  const [saving, setSaving] = useState(false);
  const [compare, setCompare] = useState(false);
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/checks/${checkId}`);
      setCheck(data);
      setNota(data.nota_atleta || '');
      setPeso(data.peso_kg ? String(data.peso_kg) : '');
      setCommento(data.commento_coach || '');
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Impossibile caricare il check');
    } finally {
      setLoading(false);
    }
  }, [checkId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !check) return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;

  const editable = !isCoach && check.stato !== 'revisionato';
  const status = CHECK_STATUS[check.stato] || CHECK_STATUS.richiesto;
  const photoFor = (source, pose) => (source?.foto || []).find((photo) => photo.posa === pose);
  const extras = (check.foto || []).filter((photo) => !POSES.some((pose) => pose.key === photo.posa));
  // tre foto affiancate anche su telefono (margini schermo + padding pannello + spazi tra le foto)
  const slotWidth = Math.min(220, Math.floor((Math.min(width, 900) - spacing.md * 4 - spacing.sm * 2 - 4) / 3));

  const upload = async (pose, camera) => {
    try {
      const picked = await pickPhoto({ camera });
      if (!picked) return;
      setBusyPose(pose);
      await api.post(`/checks/${checkId}/photos`, { posa: pose, data: picked.base64, mime: picked.mime });
      await load();
    } catch (e) {
      Alert.alert('Foto', e?.response?.data?.message || e?.message || 'Caricamento non riuscito');
    } finally {
      setBusyPose(null);
    }
  };

  const removePhoto = (photo) => Alert.alert('Elimina foto', 'Vuoi eliminare questa foto?', [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: async () => { await api.delete(`/checks/photos/${photo.photo_id}`); load(); } },
  ]);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/checks/${checkId}/submit`, { nota, pesoKg: peso });
      await load();
      Alert.alert('Check inviato', 'Il coach riceverà una notifica.');
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Invio non riuscito');
    } finally {
      setSaving(false);
    }
  };

  const review = async () => {
    setSaving(true);
    try {
      await api.put(`/checks/${checkId}/review`, { commento });
      await load();
      Alert.alert('Commento inviato', 'L\'atleta riceverà una notifica.');
    } catch (e) {
      Alert.alert('Errore', e?.response?.data?.message || 'Invio non riuscito');
    } finally {
      setSaving(false);
    }
  };

  const renderSlot = (pose) => {
    const photo = photoFor(check, pose.key);
    const previous = compare ? photoFor(check.precedente, pose.key) : null;
    return (
      <View key={pose.key} style={[styles.slot, { width: slotWidth }]}>
        <Text style={styles.slotLabel}>{pose.label}</Text>
        {compare && (
          <Pressable style={[styles.photoBox, styles.previousBox]} onPress={() => previous && setViewer(previous)}>
            {previous ? <Image source={{ uri: previous.url }} style={styles.photo} resizeMode="cover" /> : <Text style={styles.placeholderText}>Nessuna foto precedente</Text>}
            <Text style={styles.photoTag}>{fmtDate(check.precedente?.inviato_at || check.precedente?.created_at)}</Text>
          </Pressable>
        )}
        <Pressable style={styles.photoBox} onPress={() => photo && setViewer(photo)} disabled={!photo}>
          {busyPose === pose.key ? <ActivityIndicator color={colors.primary} /> : photo ? (
            <Image source={{ uri: photo.url }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name={pose.icon} size={34} color={colors.textMuted} />
              <Text style={styles.placeholderText}>{editable ? 'Aggiungi foto' : 'Nessuna foto'}</Text>
            </View>
          )}
          {compare && photo && <Text style={styles.photoTag}>Questo check</Text>}
        </Pressable>
        {editable && (
          <View style={styles.slotActions}>
            <Pressable style={styles.iconBtn} onPress={() => upload(pose.key, true)} accessibilityLabel="Scatta foto">
              <Ionicons name="camera" size={18} color={colors.primary} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => upload(pose.key, false)} accessibilityLabel="Scegli dalla galleria">
              <Ionicons name="images" size={18} color={colors.primary} />
            </Pressable>
            {photo && (
              <Pressable style={styles.iconBtn} onPress={() => removePhoto(photo)} accessibilityLabel="Elimina foto">
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Check del {fmtDate(check.inviato_at || check.created_at)}</Text>
          <View style={[styles.chip, { backgroundColor: status.bg }]}>
            <Ionicons name={status.icon} size={13} color={status.color} />
            <Text style={[styles.chipText, { color: status.color }]}>{!isCoach && check.stato === 'inviato' ? 'Inviato al coach' : status.label}</Text>
          </View>
        </View>
        {check.scadenza && check.stato === 'richiesto' && <Text style={styles.meta}>Da inviare entro il {fmtDate(check.scadenza)}</Text>}
        {!!check.nota_richiesta && (
          <View style={styles.noteBox}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
            <Text style={styles.noteText}>{check.nota_richiesta}</Text>
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Foto</Text>
          {check.precedente && (
            <Pressable style={[styles.toggle, compare && styles.toggleOn]} onPress={() => setCompare((value) => !value)}>
              <Ionicons name="git-compare-outline" size={15} color={compare ? '#fff' : colors.primary} />
              <Text style={[styles.toggleText, compare && { color: '#fff' }]}>Confronta col precedente</Text>
            </Pressable>
          )}
        </View>
        {editable && <Text style={styles.meta}>Foto con luce frontale, sfondo neutro, stessa posizione dei check precedenti.</Text>}
        <View style={styles.slots}>{POSES.map(renderSlot)}</View>
        {extras.length > 0 && (
          <View style={styles.slots}>
            {extras.map((photo) => (
              <Pressable key={photo.photo_id} style={[styles.photoBox, { width: slotWidth }]} onPress={() => setViewer(photo)}>
                <Image source={{ uri: photo.url }} style={styles.photo} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        )}
        {editable && (
          <Pressable style={styles.extraBtn} onPress={() => upload('altro', false)}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.extraText}>Aggiungi altra foto</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Note dell'atleta</Text>
        {editable ? (
          <>
            <Text style={styles.label}>Peso (kg)</Text>
            <TextInput value={peso} onChangeText={setPeso} keyboardType="decimal-pad" style={[styles.input, { maxWidth: 160 }]} placeholder="Peso" />
            <Text style={styles.label}>Come sta andando?</Text>
            <TextInput value={nota} onChangeText={setNota} style={[styles.input, styles.area]} multiline placeholder="Note per il coach" />
            <Pressable style={[styles.primaryButton, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.primaryText}>{check.stato === 'inviato' ? 'Aggiorna invio' : 'Invia al coach'}</Text>
                </>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.body}>{check.peso_kg ? `Peso: ${check.peso_kg} kg` : 'Peso non indicato'}</Text>
            <Text style={styles.body}>{check.nota_atleta || (check.stato === 'richiesto' ? 'L\'atleta non ha ancora inviato il check.' : 'Nessuna nota.')}</Text>
          </>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Commento del coach</Text>
        {isCoach ? (
          <>
            <TextInput value={commento} onChangeText={setCommento} style={[styles.input, styles.area]} multiline placeholder="Commento" />
            <Pressable style={[styles.primaryButton, (saving || check.stato === 'richiesto') && { opacity: 0.5 }]} onPress={review} disabled={saving || check.stato === 'richiesto'}>
              <Ionicons name="chatbubble-outline" size={16} color="#fff" />
              <Text style={styles.primaryText}>{check.stato === 'revisionato' ? 'Aggiorna commento' : 'Invia commento'}</Text>
            </Pressable>
            {check.stato === 'richiesto' && <Text style={styles.meta}>Potrai commentare quando l'atleta avrà inviato le foto.</Text>}
          </>
        ) : (
          <Text style={styles.body}>{check.commento_coach || 'Il coach non ha ancora commentato.'}</Text>
        )}
      </View>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer && <Image source={{ uri: viewer.url }} style={styles.viewerImage} resizeMode="contain" />}
          <View style={styles.viewerClose}><Ionicons name="close" size={28} color="#fff" /></View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, paddingBottom: 60, maxWidth: 900, width: '100%', alignSelf: 'center' },
  panel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  panelHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  title: { ...typography.h2, flexShrink: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '800' },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  noteBox: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  noteText: { flex: 1, color: colors.text },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  toggleOn: { backgroundColor: colors.primary },
  toggleText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  slot: { gap: 6 },
  slotLabel: { fontWeight: '800', color: colors.text },
  photoBox: { aspectRatio: 3 / 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  previousBox: { opacity: 0.9, borderStyle: 'dashed' },
  photo: { width: '100%', height: '100%' },
  photoTag: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  placeholder: { alignItems: 'center', gap: 6, padding: spacing.sm },
  placeholderText: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  slotActions: { flexDirection: 'row', gap: 6 },
  iconBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  extraBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, alignSelf: 'flex-start' },
  extraText: { color: colors.primary, fontWeight: '700' },
  label: { ...typography.caption, fontWeight: '700', marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceAlt },
  area: { minHeight: 90, textAlignVertical: 'top' },
  body: { ...typography.body, marginTop: 4, lineHeight: 20 },
  primaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
  primaryText: { color: '#fff', fontWeight: '800' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '90%' },
  viewerClose: { position: 'absolute', top: Platform.OS === 'web' ? 16 : 48, right: 16 },
});
