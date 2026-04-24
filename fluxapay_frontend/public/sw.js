/**
 * FluxaPay Service Worker
 *
 * Routing strategies:
 *   - /api/*          → network-first (always try network, fall back to cache)
 *   - static assets   → cache-first (serve from cache, fetch and cache on miss)
 *   - everything else → passthrough (browser default)
 *
 * Registered only in production by src/app/sw-register.tsx.
 */

const CACHE_NAME = "fluxapay-v1";
const STATIC_EXTENSIONS = /\.(js|css|png|jpg|jpeg|svg|woff2?|ttf|ico|webmanifest|json)$/;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
  } else if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // All other requests fall through to the browser default
});

/**
 * Cache-first strategy: serve from cache; fetch and cache on miss.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network-first strategy: fetch from network; fall back to cache on failure.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error(`Network request failed and no cache available for: ${request.url}`);
  }
}
