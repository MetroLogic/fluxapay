import type { CachingStrategy } from "./pwa-utils";

/**
 * Regex matching static asset file extensions that should use a cache-first strategy.
 */
export const STATIC_EXTENSIONS =
  /\.(js|css|png|jpg|jpeg|svg|woff2?|ttf|ico|webmanifest|json)$/;

/**
 * Determines the caching strategy for a given URL.
 *
 * - "network-first"  → API routes (/api/*)
 * - "cache-first"    → Static assets (JS, CSS, images, fonts, etc.)
 * - "passthrough"    → Everything else (let the browser handle it)
 */
export function selectStrategy(url: URL): CachingStrategy {
  if (url.pathname.startsWith("/api/")) return "network-first";
  if (STATIC_EXTENSIONS.test(url.pathname)) return "cache-first";
  return "passthrough";
}
