// Line Dance Tracker — Service Worker
// Strategy: Network-first for HTML/JS (always fresh), cache-first for assets.

const CACHE_NAME = 'line-dance-v1';

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
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for same-origin HTML; cache-first for everything else ─
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (Firebase, Google Fonts, etc.) — let them go straight to network
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations (the HTML page)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for same-origin static assets
  event.respondWith(cacheFirst(request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve from cache
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort: return the cached index.html for any navigation
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
    // Nothing we can do for a missing static asset offline
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
