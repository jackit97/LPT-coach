// Riconosce il link di un video e restituisce come riprodurlo dentro l'app.
// Supporta YouTube (anche "non in elenco"), Vimeo, Cloudflare Stream, Bunny Stream e file diretti (mp4/webm/m3u8).

export function parseVideo(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return { kind: 'unknown', url }; }
  const host = parsed.hostname.replace(/^www\.|^m\./, '');
  const path = parsed.pathname;

  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const id = host === 'youtu.be'
      ? path.slice(1).split('/')[0]
      : parsed.searchParams.get('v') || (path.match(/\/(?:embed|shorts|live|v)\/([\w-]{6,})/) || [])[1];
    if (!id) return { kind: 'unknown', url };
    const start = parseInt(parsed.searchParams.get('t') || parsed.searchParams.get('start') || '0', 10) || 0;
    return {
      kind: 'youtube',
      id,
      url,
      // dominio "nocookie" + rel=0: niente video consigliati di altri canali a fine riproduzione
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1${start ? `&start=${start}` : ''}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
  if (host.endsWith('vimeo.com')) {
    const parts = path.split('/').filter(Boolean);
    const id = parts.find((part) => /^\d+$/.test(part));
    const hash = parsed.searchParams.get('h') || parts[parts.indexOf(id) + 1];
    if (!id) return { kind: 'unknown', url };
    return { kind: 'vimeo', id, url, embed: `https://player.vimeo.com/video/${id}?autoplay=1&playsinline=1${hash && !/^\d+$/.test(hash) ? `&h=${hash}` : ''}` };
  }
  if (host.endsWith('cloudflarestream.com') || host.endsWith('videodelivery.net')) {
    const uid = path.split('/').filter(Boolean).find((part) => /^[a-f0-9]{32}$/i.test(part));
    if (!uid) return { kind: 'unknown', url };
    const base = host.endsWith('cloudflarestream.com') ? `https://${parsed.hostname}/${uid}/iframe` : `https://iframe.videodelivery.net/${uid}`;
    return {
      kind: 'stream',
      id: uid,
      url,
      embed: `${base}?autoplay=true&preload=auto`,
      thumbnail: host.endsWith('cloudflarestream.com') ? `https://${parsed.hostname}/${uid}/thumbnails/thumbnail.jpg` : `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg`,
    };
  }
  if (host === 'iframe.mediadelivery.net' || host === 'video.bunnycdn.com') {
    const match = path.match(/\/(?:embed|play)\/(\d+)\/([\w-]+)/);
    if (!match) return { kind: 'unknown', url };
    return { kind: 'bunny', id: match[2], url, embed: `https://iframe.mediadelivery.net/embed/${match[1]}/${match[2]}?autoplay=true&responsive=true` };
  }
  // video di esecuzione caricati dagli atleti (serviti dal Worker con link firmato)
  if (/\/reports\/execution\/\d+\/file$/.test(path)) {
    return { kind: 'file', url };
  }
  if (/\.(mp4|webm|mov|m4v|m3u8)$/i.test(path)) {
    return { kind: 'file', url };
  }
  return { kind: 'unknown', url };
}

export const isPlayable = (url) => {
  const info = parseVideo(url);
  return !!info && info.kind !== 'unknown';
};
