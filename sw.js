// Line Dance Tracker — Service Worker
// Strategy: Network-first for HTML/JS (always fresh), cache-first for assets.
// !! Bump this version string on every deploy to bust iOS's stubborn PWA cache !!

const CACHE_VERSION = 'v2';
const CACHE_NAME = `line-dance-${CACHE_VERSION}`;

// Core shell files to pre-cache on install
const PRECACHE_URLS = [
  './index.html',
  './manifest.json'
];

// ── Install: pre-cache the app shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      // skipWaiting forces this new SW to activate immediately,
      // replacing the old one without waiting for all tabs to close.
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove ALL old caches, then claim clients immediately ────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      // clients.claim() makes this SW take control of all open pages right away,
      // including the iOS home screen launch — critical for getting fresh HTML.
      .then(() => self.clients.claim())
  );
});

// ── Message: allow the page to tell the SW to skip waiting ────────────────────
// The page posts { type: 'SKIP_WAITING' } after detecting a new SW is waiting.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (Supabase, Google Fonts, Imgur, etc.)
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations (the HTML page itself)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for same-origin static assets (manifest, icons, etc.)
  event.respondWith(cacheFirst(request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve from cache
    const cached = await cache.match(request);
    if (cached) return cached;
    return cache.match('./index.html');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
