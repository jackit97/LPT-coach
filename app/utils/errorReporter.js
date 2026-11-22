import { Platform } from 'react-native';
import api from '../api/client';

// Errori dell'app inviati al profilo developer (sezione Errori). Ogni errore uguale viene inviato
// una volta sola per sessione e al massimo 20 errori per sessione, per non intasare.
const sent = new Set();
let count = 0;
let currentScreen = null;

export const setCurrentScreen = (name) => { currentScreen = name || null; };

export function appVersion() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return document.querySelector('meta[name="app-version"]')?.getAttribute('content') || 'web';
  }
  return Platform.OS;
}

export function reportError(error, extra = {}) {
  try {
    const message = String(error?.message || error || 'Errore sconosciuto').slice(0, 2000);
    const key = `${message}|${extra.schermata || currentScreen || ''}`;
    if (sent.has(key) || count >= 20) return;
    sent.add(key);
    count += 1;
    const stack = [error?.stack, extra.componentStack].filter(Boolean).join('\n--- componenti ---\n').slice(0, 6000);
    api.post('/dev/errors', { messaggio: message, stack, schermata: extra.schermata || currentScreen, versione: appVersion() }).catch(() => {});
  } catch { /* mai bloccare l'app per un errore nel segnalare un errore */ }
}

// errori non gestiti: browser (onerror / promise rifiutate) o app nativa (ErrorUtils)
export function installGlobalErrorHandlers() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      // risorse che non si caricano (immagini, font) non sono errori dell'app
      if (!event?.error && !event?.message) return;
      reportError(event.error || event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      // gli errori delle chiamate API sono gia' registrati dal server
      if (reason?.isAxiosError || reason?.response) return;
      reportError(reason || 'Promise rifiutata');
    });
    return;
  }
  const handler = global.ErrorUtils?.getGlobalHandler?.();
  global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    reportError(error, { schermata: isFatal ? `${currentScreen || ''} (fatale)` : currentScreen });
    if (handler) handler(error, isFatal);
  });
}
