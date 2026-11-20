const CACHE = 'zorvyx-shell-v5';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache
        .addAll([
          '/',
          '/index.html',
          '/manifest.webmanifest',
          '/opensearch.xml',
          '/assets/aistudio/file_00000000d6f48210967f2a13492a2ae2_cfdde145.png',
        ])
        .catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }
  // Network-first so latest app updates apply immediately, with offline cache fallback
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok && event.request.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
