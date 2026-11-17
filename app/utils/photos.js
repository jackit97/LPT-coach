import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

// Sceglie (o scatta) una foto e la ridimensiona a max 1280 px in JPEG, restituendo il base64 da caricare.
// Le foto dei check pesano cosi' ~150-300 KB invece di diversi MB.
export async function pickPhoto({ camera = false } = {}) {
  if (Platform.OS !== 'web') {
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error(camera ? 'Permesso fotocamera negato' : 'Permesso galleria negato');
  }
  const options = { mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const resize = asset.width && asset.width > asset.height
    ? (asset.width > 1280 ? [{ resize: { width: 1280 } }] : [])
    : (asset.height && asset.height > 1280 ? [{ resize: { height: 1280 } }] : []);
  const out = await ImageManipulator.manipulateAsync(asset.uri, resize, { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  return { base64: out.base64, uri: out.uri, mime: 'image/jpeg' };
}
