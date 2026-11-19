import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { TOKEN_KEY } from '../api/client';
import { API_BASE } from '../config';

export const MAX_VIDEO_MB = 90;

// Sceglie (o registra) un video di esecuzione. Restituisce { file|uri, mime, size, name } oppure null.
export async function pickExecutionVideo({ camera = false } = {}) {
  if (Platform.OS !== 'web') {
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error(camera ? 'Permesso fotocamera negato' : 'Permesso galleria negato');
  }
  const options = {
    mediaTypes: ['videos'],
    allowsEditing: Platform.OS === 'ios', // su iPhone permette di tagliare il video prima dell'invio
    videoMaxDuration: 180,
    // qualita' media: un video di 30-60 s resta di pochi MB
    videoQuality: ImagePicker.UIImagePickerControllerQualityType?.Medium ?? 1,
    videoExportPreset: ImagePicker.VideoExportPreset?.H264_1280x720,
  };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const file = asset.file || null; // presente sul web
  const mime = file?.type || asset.mimeType || (/\.mov$/i.test(asset.uri || '') ? 'video/quicktime' : 'video/mp4');
  const size = file?.size ?? asset.fileSize ?? null;
  return { file, uri: asset.uri, mime, size, name: file?.name || asset.fileName || 'video.mp4' };
}

// Carica il video sul Worker (che lo salva su R2). onProgress riceve un valore 0-1.
export async function uploadExecutionVideo(exerciseId, video, onProgress) {
  if (video.size && video.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`Il video pesa ${Math.round(video.size / 1024 / 1024)} MB: il massimo è ${MAX_VIDEO_MB} MB. Accorcialo o registralo a qualità più bassa.`);
  }
  const path = `/reports/exercises/${exerciseId}/video`;
  if (Platform.OS === 'web') {
    const body = video.file || await (await fetch(video.uri)).blob();
    const { data } = await api.post(path, body, {
      headers: { 'Content-Type': video.mime },
      transformRequest: [(value) => value],
      onUploadProgress: (event) => { if (event.total) onProgress?.(event.loaded / event.total); },
    });
    return data;
  }
  // app nativa: invio del file locale come blob
  const blob = await (await fetch(video.uri)).blob();
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': video.mime, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: blob,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data?.message || 'Caricamento non riuscito'); error.response = { data }; throw error; }
  onProgress?.(1);
  return data;
}
