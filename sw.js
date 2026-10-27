/* Memory 2026 – Service Worker
 * Cache-Version bei Updates erhöhen (z.B. 'v1.0.1'), damit alte Caches
 * automatisch gelöscht werden.
 */
const VERSION        = 'v1.0.0';
const CACHE_PREFIX   = 'memory-';
const SHELL_CACHE    = `${CACHE_PREFIX}shell-${VERSION}`;
const RUNTIME_CACHE  = `${CACHE_PREFIX}runtime-${VERSION}`;

/* App-Shell: beim Install vorgehalten.
 * Die Bootstrap-Icons-Schriftart wird NICHT precached, weil ihr Dateiname
 * buildabhängig ist – sie wird beim ersten Online-Besuch zur Laufzeit gecacht.
 */
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/bootstrap-icons.min.css',
  './js/jszip.min.js',
  './js/theme-editor.js',
  './js/slideshow.js',
  './fonts/NeonNight-LVZxg.otf',
  './fonts/RetroFancy-drvmX.otf',
  './fonts/Valeska-V44Pl.otf',
  './fonts/NobleElegantRegular-ov6vo.ttf',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Jede Datei einzeln cachen – fehlt eine, blockiert das den Install nicht.
    await Promise.all(APP_SHELL.map((url) =>
      cache.add(new Request(url, { cache: 'reload' }))
        .catch((err) => console.warn('[SW] Precache fehlgeschlagen:', url, err))
    ));
    await self.skipWaiting();
  })());
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // nur eigene Origin

  // 1) Navigation (HTML-Aufrufe): network-first, Offline-Fallback auf index.html
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  // 2) Themen-Bilder: cache-first (ändern sich praktisch nie)
  if (url.pathname.includes('/img/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3) Alles andere (CSS/JS/Fonts/Icons): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

/* ---------- Strategien ---------- */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
    }
    return response;
  } catch {
    return offlineResponse();
  }
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fb = await caches.match(fallbackUrl);
      if (fb) return fb;
    }
    return offlineResponse();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
      }
      return response;
    })
    .catch(() => null);

  return cached || (await network) || offlineResponse();
}

function offlineResponse() {
  return new Response('Offline und nicht im Cache.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}