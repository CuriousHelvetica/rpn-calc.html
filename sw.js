// Helvetica RPN — offline cache and updates.
// The app starts from the saved copy; a new version is fetched in the
// background and shown on the next start, with an UPDATED note.
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

const PAGE = './index.html';
const UPDATED = './sw-updated';  // cache mark: the saved page is a version not yet started
const html = text => new Response(text, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

// The saved page, or null if there is none. On the first start of a new
// version it carries data-updated on <html>, which shows the UPDATED note.
async function servePage() {
  const c = await caches.open(CACHE);
  const page = await c.match(PAGE);
  if (!page) return null;
  let text = await page.text();
  if (await c.match(UPDATED)) {
    await c.delete(UPDATED);
    text = text.replace(/^<html\b/m, '<html data-updated');
  }
  return html(text);
}

// Ask the server for the page and save it if it changed. 'no-cache' makes
// the browser check its copy with the server (the version tag, ETag), which
// costs a tiny reply when nothing changed. Returns the page, or null offline.
async function refreshPage(url) {
  let res;
  try { res = await fetch(url, { cache: 'no-cache' }); } catch (err) { return null; }
  if (!res.ok) return null;
  const text = await res.text();
  const c = await caches.open(CACHE);
  const old = await c.match(PAGE);
  if (!old || await old.text() !== text) {
    await c.put(PAGE, html(text));
    if (old) await c.put(UPDATED, new Response('1'));
  }
  return html(text);
}

self.addEventListener('install', e => {
  // 'no-cache': check each file with the server rather than take a possibly
  // older copy from the browser's own cache. If that replaces the saved page
  // with a different version, mark it like refreshPage does.
  const fresh = ASSETS.map(url => new Request(url, { cache: 'no-cache' }));
  e.waitUntil((async () => {
    const old = await caches.match(PAGE);
    const before = old && await old.text();
    const c = await caches.open(CACHE);
    await c.addAll(fresh);
    if (before && await (await c.match(PAGE)).text() !== before) await c.put(UPDATED, new Response('1'));
    await self.skipWaiting();
  })());
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

  // Page: start from the saved copy at once, then check for a new version in
  // the background. A new version is saved for the next start. The check
  // runs after servePage has taken the UPDATED mark, so a version is marked
  // on its own first start, never on the start that downloaded it.
  if (req.mode === 'navigate') {
    const served = servePage();
    const refreshed = served.then(() => refreshPage(req.url));
    e.waitUntil(refreshed);
    // First start (nothing saved yet): wait for the download.
    e.respondWith(served.then(page => page || refreshed.then(res => res || Response.error())));
    return;
  }

  // Fonts, icons, manifest: serve from cache, fetch if missing.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
