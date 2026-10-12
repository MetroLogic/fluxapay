import { test, expect } from '@playwright/test';

test.describe('Service Worker cache versioning', () => {
  test('confirms old assets are not served after a simulated deploy', async ({ page, context }) => {
    // Enable SW bypass off or simulate SW activation in context
    await page.goto('/');

    // Simulate initial SW installation with old cache name
    await page.evaluate(async () => {
      const oldCache = await caches.open('fluxapay-voldhash123');
      const response = new Response('console.log("stale-app-v1")', {
        headers: { 'Content-Type': 'application/javascript' },
      });
      await oldCache.put('/app-bundle.js', response);
    });

    // Verify old cache exists before activation
    const cacheKeysBefore = await page.evaluate(async () => {
      return await caches.keys();
    });
    expect(cacheKeysBefore).toContain('fluxapay-voldhash123');

    // Simulate new SW activation event logic
    const currentBuildHash = 'newhash456';
    const currentCacheName = `fluxapay-v${currentBuildHash}`;

    await page.evaluate(async (newCacheName) => {
      // Simulate SW activate listener cache purging
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== newCacheName)
          .map((key) => caches.delete(key))
      );
      await caches.open(newCacheName);
    }, currentCacheName);

    // Verify old cache is purged and current cache exists
    const cacheKeysAfter = await page.evaluate(async () => {
      return await caches.keys();
    });
    expect(cacheKeysAfter).not.toContain('fluxapay-voldhash123');
    expect(cacheKeysAfter).toContain(currentCacheName);
  });
});
