import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

// Aggiornamento automatico della versione web/PWA. A ogni deploy (npm run build:web) cambiano sw.js e
// version.json: quando l'app trova una versione nuova si ricarica da sola dopo pochi secondi, cosi'
// non si resta mai con un'app vecchia che parla con il worker nuovo. Se si sta scrivendo in un campo
// aspetta che si finisca, per non perdere il testo. Il login resta valido: non serve rientrare.
const CHECK_EVERY_MS = 2 * 60 * 1000;
const COUNTDOWN_S = 5;

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

const isTyping = () => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

async function hardReload(registration) {
  try {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch { /* ignore */ }
  // cache-buster: forza il browser a riscaricare index.html
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString(36));
  window.location.replace(url.toString());
}

export default function AppUpdater() {
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(COUNTDOWN_S);
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
    const onControllerChange = () => {
      if (reloadingRef.current) return;
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

  // versione nuova trovata: conto alla rovescia e ricarica (in pausa mentre si scrive in un campo)
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => {
      if (isTyping()) { setSeconds(COUNTDOWN_S); return; }
      setSeconds((value) => {
        if (value <= 1) {
          clearInterval(timer);
          if (!reloadingRef.current) {
            reloadingRef.current = true;
            if (targetVersionRef.current) writeReloadFor(targetVersionRef.current);
            hardReload(registrationRef.current);
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pending]);

  if (Platform.OS !== 'web' || !pending) return null;
  return (
    <View style={styles.banner} pointerEvents="none">
      <Text style={styles.text}>
        ⬆ Nuova versione di LPT Coach: {isTyping() ? 'aggiorno appena finisci di scrivere…' : `aggiorno tra ${seconds}s…`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, alignItems: 'center', padding: spacing.sm },
  text: { backgroundColor: colors.primary, color: '#fff', fontWeight: '800', fontSize: 13, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.lg, overflow: 'hidden' },
});
