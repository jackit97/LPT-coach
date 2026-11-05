const CACHE_NAME = 'lpt-coach-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

// Installazione del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
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