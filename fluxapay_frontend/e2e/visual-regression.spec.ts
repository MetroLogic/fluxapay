import { test, expect } from '@playwright/test';

/**
 * Visual regression tests.
 *
 * These require committed screenshot baselines generated via:
 *   npx playwright test --config=playwright.config.ts --update-snapshots
 *
 * They are skipped in CI when no baselines exist to prevent the job from
 * hanging (Playwright fails + retries every toHaveScreenshot call when there
 * is no reference image, consuming the full per-test timeout × retries).
 *
 * To regenerate baselines locally:
 *   E2E_UPDATE_SNAPSHOTS=true npx playwright test visual-regression.spec.ts
 */
const SKIP_IN_CI = !!process.env.CI && !process.env.E2E_VISUAL_BASELINES;

test.describe('Visual Regression Tests', () => {
  test.skip(SKIP_IN_CI, 'No snapshot baselines committed — skipping visual regression in CI');

  const paymentId = 'pay_test_visual_001';

  const mockPendingPayment = {
    id: paymentId,
    amount: 150,
    currency: 'USD',
    status: 'pending',
    merchantName: 'Visual Regression Merchant',
    depositAddress: 'GTEST123STELLARADDRESS',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    successUrl: null,
  };

  test('Dashboard UI visual regression', async ({ page }) => {
    await page.route('**/api/merchants/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'merch_visual_test', business_name: 'Visual Test Merchant' }),
      })
    );

    await page.route('**/api/payments*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [mockPendingPayment],
          pagination: { total: 1, page: 1, limit: 10 }
        }),
      })
    );

    await page.goto('/dashboard');
    await expect(page.getByRole('navigation').or(page.getByText(/payments/i))).toBeVisible();

    await expect(page).toHaveScreenshot('dashboard.png', {
      mask: [page.locator('.dynamic-date'), page.locator('.dynamic-chart')],
      fullPage: true,
    });
  });

  test('Checkout UI visual regression - Pending', async ({ page }) => {
    await page.route(`**/api/payments/${paymentId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPendingPayment),
      })
    );

    await page.route(`**/api/payments/${paymentId}/status`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending' }),
      })
    );

    await page.goto(`/pay/${paymentId}`);
    await expect(page.getByAltText(/qr code/i).or(page.getByText(/scan/i))).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('checkout-pending.png', { fullPage: true });
  });

  test('Checkout UI visual regression - Confirmed', async ({ page }) => {
    await page.route(`**/api/payments/${paymentId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockPendingPayment, status: 'confirmed' }),
      })
    );

    await page.goto(`/pay/${paymentId}`);
    await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot('checkout-confirmed.png', { fullPage: true });
  });
});
