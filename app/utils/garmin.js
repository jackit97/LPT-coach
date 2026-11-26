import { Alert, Linking, Platform } from 'react-native';
import api from '../api/client';

// Apre la pagina di autorizzazione Garmin (anche per ricollegare e concedere permessi mancanti)
export async function connectGarmin() {
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
  const { data } = await api.post('/garmin/connect', { origin: isWeb ? window.location.origin : undefined });
  if (isWeb) window.location.href = data.url;
  else await Linking.openURL(data.url);
}

// Pulsante "Sync Garmin": se manca il permesso dei dati storici propone di ricollegare l'account
export async function refreshGarminActivities() {
  try {
    const { data } = await api.post('/garmin/refresh');
    Alert.alert('Garmin', data.message || 'Sync Garmin avviato');
    return true;
  } catch (e) {
    const { code, message } = e?.response?.data || {};
    if (code === 'GARMIN_HISTORY_PERMISSION' || code === 'GARMIN_RECONNECT') {
      Alert.alert(
        'Ricollega Garmin',
        `${message || 'Serve ricollegare Garmin.'}\n\nVuoi ricollegarlo adesso?`,
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Ricollega Garmin', onPress: () => connectGarmin().catch((err) => Alert.alert('Garmin', err?.response?.data?.message || 'Collegamento non avviato')) },
        ],
      );
      return false;
    }
    Alert.alert('Garmin', message || 'Sync Garmin non riuscito');
    return false;
  }
}
