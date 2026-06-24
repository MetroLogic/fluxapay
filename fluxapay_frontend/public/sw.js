/**
 * FluxaPay Service Worker
 *
 * Caching strategies:
 *   - /api/*                  → network-first (live data; cache as offline fallback)
 *   - /pay/* (navigate)       → stale-while-revalidate (checkout shell)
 *   - static assets           → cache-first (JS/CSS/fonts/images)
 *   - everything else         → passthrough (browser default)
 *
 * Registered only in production by src/app/sw-register.tsx.
 */

const SHELL_CACHE = 'fluxapay-shell-v1';
const STATIC_CACHE = 'fluxapay-static-v1';
const KNOWN_CACHES = [SHELL_CACHE, STATIC_CACHE];

const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|woff2?|ttf|ico|webmanifest|json)$/;

const PRECACHE_URLS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Precache shell assets on install so the checkout page loads offline immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// Remove caches from older SW versions on activate.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !KNOWN_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/pay/') && request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

/**
 * Cache-first: serve from cache, populate cache on miss.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network-first: fetch from network, cache success, fall back to cache on failure.
 */
async function networkFirst(request) {
  const cacheName = STATIC_CACHE;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error(`Network request failed and no cache available for: ${request.url}`);
  }
}

/**
 * Stale-while-revalidate: respond from cache immediately, refresh cache in background.
 * Falls back to network when not yet cached; throws when both are unavailable.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  const networkPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  });

  if (cached) {
    // Serve stale immediately; let network update the cache in background.
    networkPromise.catch(() => {});
    return cached;
  }

  return networkPromise;
}
