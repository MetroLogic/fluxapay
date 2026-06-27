import type { CachingStrategy } from "./pwa-utils";

/**
 * Regex matching static asset file extensions that should use a cache-first strategy.
 */
export const STATIC_EXTENSIONS =
  /\.(js|css|png|jpg|jpeg|svg|woff2?|ttf|ico|webmanifest|json)$/;

/**
 * Determines the caching strategy for a given URL.
 *
 * - "stale-while-revalidate" → Dashboard stats and payment list APIs
 * - "network-only"           → Mutations (POST/PUT/DELETE)
 * - "cache-first"            → Static assets (JS, CSS, images, fonts, etc.)
 * - "passthrough"            → Everything else (let the browser handle it)
 */
export function selectStrategy(url: URL, method: string = "GET"): CachingStrategy {
  if (STATIC_EXTENSIONS.test(url.pathname)) return "cache-first";

  if (url.pathname.startsWith("/api/")) {
    // Mutations always use network-only
    if (method && /^(POST|PUT|DELETE|PATCH)$/i.test(method)) {
      return "network-only";
    }

    // Dashboard stats and payment list use stale-while-revalidate
    if (
      url.pathname.includes("/dashboard") ||
      url.pathname.includes("/stats") ||
      url.pathname.includes("/settlements") ||
      url.pathname.includes("/payments")
    ) {
      return "stale-while-revalidate";
    }

    return "network-first";
  }

  return "passthrough";
}
