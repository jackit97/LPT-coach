import { Platform } from 'react-native';

// Selettore file per la versione web/PWA (input nascosto). Restituisce il File scelto o null.
// Su app nativa non c'e' ancora un selettore documenti: in quel caso restituisce { unsupported: true }.
export function pickFile({ accept = '*/*' } = {}) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve({ unsupported: true });
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } input.remove(); };
    input.addEventListener('change', () => done(input.files?.[0] || null));
    // se l'utente chiude il selettore senza scegliere, al ritorno del focus non c'e' nessun file
    window.addEventListener('focus', () => setTimeout(() => { if (!input.files?.length) done(null); }, 800), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export function userTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'; } catch { return 'Europe/Rome'; }
}
