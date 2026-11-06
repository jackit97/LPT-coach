const CACHE_NAME = 'lpt-coach-v2';
const urlsToCache = [
  '/',
  '/index.html'
];

// Installazione del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('lpt-coach-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

// Intercettazione delle richieste di rete
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Ritorna la risorsa in cache se esiste, altrimenti va in rete
        return response || fetch(event.request);
      })
  );
});