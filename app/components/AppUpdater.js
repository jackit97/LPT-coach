import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

// Aggiornamento automatico della PWA: a ogni deploy su Cloudflare Pages cambiano sw.js e version.json.
// Quando l'app trova una versione nuova mostra un popup con il solo tasto OK, che attiva la nuova
// versione e ricarica la pagina.
const CHECK_EVERY_MS = 15 * 60 * 1000;

const currentVersion = () => {
  if (typeof document === 'undefined') return null;
  return document.querySelector('meta[name="app-version"]')?.getAttribute('content') || null;
};

async function hardReload() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch { /* ignore */ }
  window.location.reload();
}

export default function AppUpdater() {
  const [visible, setVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const registrationRef = useRef(null);
  const reloadingRef = useRef(false);

  const checkVersion = useCallback(async () => {
    const mine = currentVersion();
    if (!mine) return;
    try {
      registrationRef.current?.update?.()?.catch?.(() => {});
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = await res.json();
      if (version && version !== mine) setVisible(true);
    } catch { /* offline: riprova piu' tardi */ }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;

    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registrationRef.current = registration;
      // Una versione nuova era gia' scaricata e in attesa
      if (registration.waiting && navigator.serviceWorker.controller) setVisible(true);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setVisible(true);
        });
      });
      checkVersion();
    }).catch(() => checkVersion());

    const onVisible = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(checkVersion, CHECK_EVERY_MS);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [checkVersion]);

  const applyUpdate = async () => {
    setUpdating(true);
    const registration = registrationRef.current || await navigator.serviceWorker.getRegistration().catch(() => null);
    const waiting = registration?.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      // se il cambio di service worker non arriva, ricarica comunque
      setTimeout(hardReload, 4000);
      return;
    }
    hardReload();
  };

  if (Platform.OS !== 'web') return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>⬆</Text>
          <Text style={styles.title}>Nuova versione disponibile</Text>
          <Text style={styles.text}>LPT Coach è stato aggiornato. Premi OK per completare l'aggiornamento.</Text>
          <Pressable style={[styles.button, updating && { opacity: 0.6 }]} onPress={applyUpdate} disabled={updating}>
            <Text style={styles.buttonText}>{updating ? 'Aggiornamento…' : 'OK'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  icon: { fontSize: 30, color: colors.primary, marginBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  text: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  button: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignSelf: 'stretch', alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
