import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

// Aggiornamento della versione web/PWA. A ogni deploy (npm run build:web) cambiano sw.js e version.json:
// quando l'app trova una versione nuova mostra un avviso a tutto schermo che blocca l'app; con "OK"
// si aggiorna. Cosi' non si resta con un'app vecchia che parla con il worker nuovo e non si puo'
// continuare a usarla mentre si aggiorna. Il login resta valido: non serve rientrare.
const CHECK_EVERY_MS = 2 * 60 * 1000;

let checkNow = null;
// chiamata dal client API quando il server risponde con un errore: magari l'app e' vecchia
export function checkForUpdate() { if (checkNow) checkNow(); }

const metaVersion = () => {
  if (typeof document === 'undefined') return null;
  return document.querySelector('meta[name="app-version"]')?.getAttribute('content') || null;
};

const RELOAD_KEY = 'lpt_reload_for';
const readReloadFor = () => { try { return window.sessionStorage.getItem(RELOAD_KEY); } catch { return null; } };
const writeReloadFor = (version) => { try { window.sessionStorage.setItem(RELOAD_KEY, version); } catch { /* ignore */ } };

const RELOADED_AT_KEY = 'lpt_reloaded_at';
const justUpdated = () => {
  try { return Date.now() - Number(window.sessionStorage.getItem(RELOADED_AT_KEY) || 0) < 20000; } catch { return false; }
};

// Una sola ricarica: prima si attiva il service worker nuovo (e si aspetta che prenda il controllo),
// poi si svuota la cache e si riapre la pagina. Prima la pagina nuova veniva ricaricata una seconda volta
// quando il service worker prendeva il controllo dopo la navigazione.
async function hardReload(registration) {
  try {
    const waiting = registration?.waiting;
    if (waiting && 'serviceWorker' in navigator) {
      await new Promise((resolve) => {
        const done = () => { navigator.serviceWorker.removeEventListener('controllerchange', done); resolve(); };
        navigator.serviceWorker.addEventListener('controllerchange', done);
        waiting.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(done, 4000);
      });
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch { /* ignore */ }
  try { window.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now())); } catch { /* ignore */ }
  // cache-buster: forza il browser a riscaricare index.html
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString(36));
  window.location.replace(url.toString());
}

export default function AppUpdater() {
  const [pending, setPending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const registrationRef = useRef(null);
  const knownVersionRef = useRef(metaVersion());
  const reloadingRef = useRef(false);
  const targetVersionRef = useRef(null);

  const checkVersion = useCallback(async () => {
    try {
      registrationRef.current?.update?.()?.catch?.(() => {});
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = await res.json();
      if (!version) return;
      // build senza <meta app-version>: la prima versione letta fa da riferimento
      if (!knownVersionRef.current) { knownVersionRef.current = version; return; }
      if (version === knownVersionRef.current) return;
      // gia' ricaricato per questa versione ma la pagina e' rimasta quella vecchia (es. cache della CDN):
      // niente ricariche a ripetizione, la si accetta e si riprova al prossimo deploy
      if (readReloadFor() === version) { knownVersionRef.current = version; return; }
      targetVersionRef.current = version;
      setPending(true);
    } catch { /* offline: riprova piu' tardi */ }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    // l'URL con ?v= serve solo a scavalcare la cache: lo ripulisce
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('v')) { url.searchParams.delete('v'); window.history.replaceState(window.history.state, '', url.toString()); }
    } catch { /* ignore */ }

    let throttle = 0;
    checkNow = () => { const now = Date.now(); if (now - throttle > 10000) { throttle = now; checkVersion(); } };

    const hasSw = 'serviceWorker' in navigator;
    // il service worker nuovo ha preso il controllo mentre la pagina era aperta (aggiornamento avviato da
    // un'altra scheda): ricarica. Non alla prima installazione ne' subito dopo un aggiornamento appena fatto.
    const hadController = hasSw && !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (reloadingRef.current || !hadController || justUpdated()) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    if (hasSw) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        registrationRef.current = registration;
        if (registration.waiting && navigator.serviceWorker.controller) setPending(true);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setPending(true);
          });
        });
      }).catch(() => {});
    }
    checkVersion();

    const onVisible = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = setInterval(checkVersion, CHECK_EVERY_MS);
    return () => {
      checkNow = null;
      if (hasSw) navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(timer);
    };
  }, [checkVersion]);

  const startUpdate = () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    setUpdating(true);
    if (targetVersionRef.current) writeReloadFor(targetVersionRef.current);
    hardReload(registrationRef.current);
  };

  if (Platform.OS !== 'web' || !pending) return null;
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.icon}>⬆</Text>
        <Text style={styles.title}>Nuova versione di LPT Coach</Text>
        <Text style={styles.text}>
          {updating ? 'Aggiornamento in corso, attendi qualche secondo…' : 'È disponibile un aggiornamento dell\'app. Premi OK per aggiornare: rimani collegato con il tuo account.'}
        </Text>
        {updating ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.md }} />
        ) : (
          <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]} onPress={startUpdate} accessibilityLabel="Aggiorna l'app">
            <Text style={styles.buttonText}>OK, aggiorna</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // a tutto schermo sopra l'app: finche' non si aggiorna non si puo' toccare nient'altro
  overlay: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100000,
    backgroundColor: 'rgba(15, 23, 42, 0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  icon: { fontSize: 30, color: colors.primary, fontWeight: '900' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.xs, textAlign: 'center' },
  text: { fontSize: 14, color: colors.textMuted, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
  button: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignSelf: 'stretch', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
