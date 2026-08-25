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

const BUILD_HASH = self.NEXT_PUBLIC_BUILD_HASH || 'dev';
const CACHE_NAME = `fluxapay-v${BUILD_HASH}`;

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
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// Delete all caches not matching the current version on activate.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/pay/') && request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }

  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }
});

/**
 * Cache-first: serve from cache, populate cache on miss.
 */
async function cacheFirst(request, cacheName = CACHE_NAME) {
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
  const cacheName = CACHE_NAME;
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
