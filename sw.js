// Helvetica RPN — offline cache.
// When adding or renaming a file the app needs, add it to ASSETS and bump CACHE.
const CACHE = 'helvetica-rpn-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/orbitron-700-latin.woff2',
  './fonts/share-tech-mono-400-latin.woff2',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Page: try the network first so updates show up when online; fall back to cache offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Fonts, icons, manifest: serve from cache, fetch if missing.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
