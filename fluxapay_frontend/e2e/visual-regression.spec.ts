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

  test('Checkout UI visual regression - Address Change', async ({ page }) => {
    let currentAddress = 'GTEST123STELLARADDRESS';
    await page.route(`**/api/payments/${paymentId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockPendingPayment, depositAddress: currentAddress }),
      })
    );

    await page.goto(`/pay/${paymentId}`);
    await expect(page.getByAltText(/qr code/i).or(page.getByText(/scan/i))).toBeVisible({ timeout: 5000 });

    currentAddress = 'GNEWADDRESS99999STELLARADDR';
    await page.route(`**/api/payments/${paymentId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockPendingPayment, depositAddress: currentAddress }),
      })
    );

    await expect(page).toHaveScreenshot('checkout-address-updated.png', { fullPage: true });
  });
  /**
   * Analytics loading and empty states (#778).
   *
   * The loading shot is the one that matters: it is the frame where a blank
   * area used to sit, and comparing it against the loaded layout is how a
   * reintroduced layout shift gets caught.
   */
  test('Analytics skeleton visual regression - loading state', async ({ page }) => {
    // Hold the analytics response open so the skeleton is what renders.
    await page.route('**/api/**/analytics**', () => {
      /* never fulfilled — the request stays in flight */
    });

    await page.goto('/dashboard/analytics');
    await expect(page.getByTestId('analytics-skeleton')).toBeVisible();

    await expect(page).toHaveScreenshot('analytics-loading.png', { fullPage: true });
  });

  test('Analytics empty state visual regression', async ({ page }) => {
    await page.route('**/api/**/analytics**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: { total_revenue: 0, total_payments: 0, active_merchants: 0, growth_rate: 0 },
          revenue_trends: [],
          payment_distribution: [],
          revenue_by_country: [],
        }),
      })
    );

    await page.goto('/dashboard/analytics');
    await expect(page.getByText(/no revenue trend data for this period/i)).toBeVisible();

    await expect(page).toHaveScreenshot('analytics-empty.png', { fullPage: true });
  });
});
