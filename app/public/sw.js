// __BUILD_ID__ viene sostituito ad ogni build (scripts/prepare-web-pwa.js): un sw.js diverso
// fa scattare l'aggiornamento della PWA gia' installata.
const BUILD_ID = '__BUILD_ID__';
const CACHE_NAME = `lpt-coach-${BUILD_ID}`;
const urlsToCache = [
  '/',
  '/favicon.ico',
  '/manifest.webmanifest'
];

// Installazione: scarica gli asset base. La nuova versione resta "in attesa" finche' l'utente
// non preme OK nel popup di aggiornamento (messaggio SKIP_WAITING); alla prima installazione si attiva subito.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.clients.matchAll({ includeUncontrolled: true }))
      .then((clients) => { if (!clients.length) return self.skipWaiting(); return undefined; })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Attivazione: elimina tutte le vecchie cache precedenti e prende il controllo
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

// Strategia Network-First per HTML e navigazione (evita schermate bianche su deploy/aggiornamenti)
self.addEventListener('fetch', (event) => {
  const isNavigate = event.request.mode === 'navigate' || event.request.destination === 'document';

  // Il file di versione non va mai servito dalla cache
  if (new URL(event.request.url).pathname === '/version.json') return;

  if (isNavigate) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Per asset statici (js, css, immagini): Stale-While-Revalidate con fallback di rete
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});