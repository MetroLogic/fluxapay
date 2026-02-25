import { test, expect } from '@playwright/test';

/**
 * E2E – Checkout / payment flow
 * Mocks the status polling API so no real blockchain is needed.
 */
test.describe('Checkout flow', () => {
  const paymentId = 'pay_test_001';

  const mockPendingPayment = {
    id: paymentId,
    amount: 100,
    currency: 'USD',
    status: 'pending',
    merchantName: 'Test Merchant',
    depositAddress: 'GTEST123STELLARADDRESS',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    successUrl: null,
  };

  test('shows loading then payment QR when pending', async ({ page }) => {
    await page.route(`**/api/payments/${paymentId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPendingPayment),
      }),
    );

    await page.route(`**/api/payments/${paymentId}/status`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending' }),
      }),
    );

    await page.goto(`/pay/${paymentId}`);
    await expect(page.getByAltText(/qr code/i).or(page.getByText(/scan/i))).toBeVisible({ timeout: 5000 });
  });

  test('shows confirmed state when payment completes', async ({ page }) => {
    await page.route(`**/api/payments/${paymentId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockPendingPayment, status: 'confirmed' }),
      }),
    );

    await page.goto(`/pay/${paymentId}`);
    await expect(page.getByText(/payment confirmed/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows error state for unknown payment', async ({ page }) => {
    await page.route(`**/api/payments/unknown_id`, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) }),
    );

    await page.goto('/pay/unknown_id');
    await expect(page.getByRole('heading', { name: /payment not found/i })).toBeVisible({ timeout: 5000 });
  });
});
