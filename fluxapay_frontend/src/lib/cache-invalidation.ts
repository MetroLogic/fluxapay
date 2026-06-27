/**
 * Cache invalidation utilities for PWA offline support.
 * Clears API response caches when user logs out or on demand.
 */

const CACHE_NAMES = [
  "api-cache-v1",
  "dashboard-cache-v1",
  "settlements-cache-v1",
  "payments-cache-v1",
];

/**
 * Invalidate all API caches (called on logout).
 */
export async function invalidateAllCaches(): Promise<void> {
  if (typeof caches === "undefined") return;

  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => CACHE_NAMES.some((prefix) => name.includes(prefix)))
        .map((name) => caches.delete(name))
    );
  } catch (error) {
    console.error("Failed to invalidate caches:", error);
  }
}

/**
 * Invalidate specific cache by pattern (e.g., "dashboard").
 */
export async function invalidateCacheByPattern(
  pattern: string
): Promise<void> {
  if (typeof caches === "undefined") return;

  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.includes(pattern))
        .map((name) => caches.delete(name))
    );
  } catch (error) {
    console.error(`Failed to invalidate cache for pattern ${pattern}:`, error);
  }
}

/**
 * Clear local storage timestamps for all cached API responses.
 */
export function clearCacheTimestamps(): void {
  if (typeof localStorage === "undefined") return;

  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith("cache_timestamp_")) {
      localStorage.removeItem(key);
    }
  });
}
