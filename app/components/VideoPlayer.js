import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View, Linking, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';
import { parseVideo } from '../utils/video';

// Su Android/iOS il player usa react-native-webview; sul web un <iframe>/<video> nativo del browser.
let WebView = null;
if (Platform.OS !== 'web') {
  try { WebView = require('react-native-webview').WebView; } catch { WebView = null; }
}

function videoHtml(src) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;height:100%}video{width:100%;height:100%}</style></head><body><video src="${src}" controls autoplay playsinline></video></body></html>`;
}

function PlayerSurface({ info }) {
  if (Platform.OS === 'web') {
    if (info.kind === 'file') {
      return React.createElement('video', { src: info.url, controls: true, autoPlay: true, playsInline: true, style: { width: '100%', height: '100%', backgroundColor: '#000' } });
    }
    return React.createElement('iframe', {
      src: info.embed,
      title: 'Video',
      allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
      allowFullScreen: true,
      style: { width: '100%', height: '100%', border: 0, backgroundColor: '#000' },
    });
  }
  if (!WebView) return <Text style={styles.fallback}>Aggiorna l'app per vedere i video qui.</Text>;
  return (
    <WebView
      source={info.kind === 'file' ? { html: videoHtml(info.url) } : { uri: info.embed }}
      style={{ flex: 1, backgroundColor: '#000' }}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      originWhitelist={['*']}
    />
  );
}

// Player dentro una pagina/popup (16:9), usato nella scheda dell'esercizio.
export function InlinePlayer({ url, width, aspectRatio = 16 / 9 }) {
  const info = parseVideo(url);
  if (!info) return null;
  return (
    <View style={{ width: width || '100%', aspectRatio, backgroundColor: '#000', borderRadius: radius.md, overflow: 'hidden' }}>
      {info.kind !== 'unknown' ? <PlayerSurface info={info} /> : (
        <View style={styles.unknown}>
          <Text style={styles.fallback}>Questo link non si può riprodurre nell'app.</Text>
          <Pressable style={styles.externalBtn} onPress={() => Linking.openURL(url)}>
            <Text style={styles.externalText}>Apri il link</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Player a schermo intero (modale) con titolo e chiusura.
export function VideoPlayerModal({ url, title, visible, onClose }) {
  const { width, height } = useWindowDimensions();
  const info = parseVideo(url);
  const playerWidth = Math.min(width - 24, 960);
  const playerHeight = Math.min(playerWidth * (9 / 16), height - 160);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.overlay}>
        <View style={[styles.header, { width: playerWidth }]}>
          <Text style={styles.title} numberOfLines={1}>{title || 'Video'}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Chiudi video">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
        <View style={{ width: playerWidth, height: playerHeight, backgroundColor: '#000', borderRadius: radius.md, overflow: 'hidden' }}>
          {visible && info && info.kind !== 'unknown' ? <PlayerSurface info={info} /> : (
            <View style={styles.unknown}>
              <Text style={styles.fallback}>Questo link non si può riprodurre nell'app.</Text>
              <Pressable style={styles.externalBtn} onPress={() => Linking.openURL(url)}>
                <Text style={styles.externalText}>Apri il link</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Pulsante "play" riutilizzabile: apre il video nel player dell'app.
export default function PlayButton({ url, title, size = 'md', label }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  const dim = size === 'sm' ? 30 : size === 'lg' ? 52 : 38;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [label ? styles.labelBtn : [styles.round, { width: dim, height: dim, borderRadius: dim / 2 }], pressed && { opacity: 0.75 }]}
        accessibilityLabel={`Guarda il video ${title || ''}`}
        hitSlop={6}
      >
        <Ionicons name="play" size={label ? 16 : Math.round(dim * 0.5)} color="#fff" style={label ? null : { marginLeft: 2 }} />
        {!!label && <Text style={styles.labelText}>{label}</Text>}
      </Pressable>
      <VideoPlayerModal url={url} title={title} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  title: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  close: { padding: 4 },
  round: { backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  labelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DC2626', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  labelText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  unknown: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  fallback: { color: '#fff', textAlign: 'center' },
  externalBtn: { marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  externalText: { color: '#fff', fontWeight: '700' },
});
