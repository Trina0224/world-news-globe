const CACHE_NAME = 'world-news-globe-v5';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './japan-overlay.css',
  './us-overlay.css',
  './app-v2.js',
  './news-static.js',
  './japan-overlay.js',
  './us-overlay.js',
  './us-dc.js',
  './desktop-map-click-fix.js',
  './language-system.js',
  './client-state.js',
  './live-refresh.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/')) {
    const canonical = new Request(url.origin + url.pathname, { method: 'GET' });
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(canonical, copy));
        return response;
      }).catch(() => caches.match(canonical))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request, { ignoreSearch: true }).then(hit => hit || fetch(request)));
});
