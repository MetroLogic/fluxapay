import { test, expect, type Page } from '@playwright/test';

/**
 * E2E – payment link checkout flow (issue #1273).
 *
 * A customer opens the checkout URL of a payment created from a payment link
 * (`/pay/<payment_id>`). Every backend call the page makes is intercepted with
 * `page.route`, so the test needs neither a backend nor a blockchain:
 *
 *   GET /api/payments/:id         checkout details (amount, merchant, address)
 *   GET /api/payments/:id/stream  SSE status channel; each response delivers one
 *                                 event and closes, so the client reconnects
 *                                 about once a second and picks up the change
 *   GET /api/payments/:id/status  polling fallback, kept consistent with SSE
 *   GET /api/v1/fx-rates          fiat equivalent shown under the amount
 *
 * "Payment completion" is simulated by flipping the mock to report
 * `confirmed`, after which the success screen must appear and the customer is
 * redirected to the merchant's success URL.
 */

const PAYMENT_ID = 'pl_checkout_e2e_001';
const MERCHANT_NAME = 'Acme Coffee';
const LINK_TITLE = 'Pro plan - monthly';
const AMOUNT = 25;
const CURRENCY = 'USDC';
const ADDRESS = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const SUCCESS_PATH = '/e2e/merchant-thanks';

function checkoutPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    amount: AMOUNT,
    currency: CURRENCY,
    address: ADDRESS,
    status: 'pending',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    merchantName: MERCHANT_NAME,
    // Charges created from a payment link carry the link's title.
    description: `Payment via link: ${LINK_TITLE}`,
    checkoutAccentColor: '#635BFF',
    successUrl: SUCCESS_PATH,
    ...overrides,
  };
}

interface CheckoutMock {
  /** Simulate the on-chain payment landing: later status reads say `confirmed`. */
  completePayment: () => void;
  /** Number of times the checkout details were fetched. */
  detailRequests: () => number;
}

async function mockCheckoutApi(page: Page): Promise<CheckoutMock> {
  let paid = false;
  let details = 0;
  const currentStatus = () =>
    paid
      ? { status: 'confirmed', transactionHash: 'a'.repeat(64) }
      : { status: 'pending' };

  await page.route(`**/api/payments/${PAYMENT_ID}`, async (route) => {
    details += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(checkoutPayment()),
    });
  });

  await page.route(`**/api/payments/${PAYMENT_ID}/stream`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: `data: ${JSON.stringify(currentStatus())}\n\n`,
    });
  });

  await page.route(`**/api/payments/${PAYMENT_ID}/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentStatus()),
    });
  });

  await page.route('**/api/v1/fx-rates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { base_currency: 'USD', target_currency: 'USDC', rate: 1 } }),
    });
  });

  // The merchant's success page the customer is sent back to.
  await page.route(`**${SUCCESS_PATH}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Thanks</title><h1>Thanks for your order</h1>',
    });
  });

  return {
    completePayment: () => {
      paid = true;
    },
    detailRequests: () => details,
  };
}

async function expectPendingCheckout(page: Page) {
  await expect(page.getByRole('heading', { name: /complete your payment/i })).toBeVisible({
    timeout: 15_000,
  });

  // Amount, in the accessible region that wraps the headline figure.
  const amount = page.getByRole('region', { name: `Payment amount: ${AMOUNT} ${CURRENCY}` });
  await expect(amount).toBeVisible();
  await expect(amount).toContainText(`${AMOUNT} ${CURRENCY}`);

  // Merchant and payment link title.
  await expect(page.getByText(`to ${MERCHANT_NAME}`)).toBeVisible();
  await expect(page.getByText(`Payment via link: ${LINK_TITLE}`)).toBeVisible();

  // QR code encoding the deposit address and amount.
  const qr = page.getByRole('img', {
    name: `QR code for Stellar payment of ${AMOUNT} to deposit address ${ADDRESS}`,
  });
  await expect(qr).toBeVisible();
  const box = await qr.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);
}

async function expectSuccessAndRedirect(page: Page) {
  // SSE normally delivers the update within ~1s; if a browser drops the
  // mocked stream, the client falls back to 10s polling, hence the headroom.
  await expect(page.getByRole('heading', { name: /payment confirmed/i })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText(/successfully processed/i)).toBeVisible();
  // The QR code is gone once the payment is confirmed.
  await expect(page.getByRole('img', { name: /QR code for Stellar payment/ })).toHaveCount(0);

  // The page redirects to the merchant's success URL ~2s after confirmation.
  await page.waitForURL(`**${SUCCESS_PATH}`, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /thanks for your order/i })).toBeVisible();
}

test.describe('Payment link checkout – desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('renders the link details and transitions to success when paid', async ({ page }) => {
    test.setTimeout(90_000);
    const api = await mockCheckoutApi(page);

    await page.goto(`/pay/${PAYMENT_ID}`);
    await expectPendingCheckout(page);
    expect(api.detailRequests()).toBeGreaterThanOrEqual(1);

    // Still pending: the success screen must not appear on its own.
    await page.waitForTimeout(1_500);
    await expect(page.getByRole('heading', { name: /payment confirmed/i })).toHaveCount(0);

    api.completePayment();
    await expectSuccessAndRedirect(page);
  });

  test('shows the not-found state for an unknown payment link', async ({ page }) => {
    await page.route('**/api/payments/unknown_link_id', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' }),
      }),
    );

    await page.goto('/pay/unknown_link_id');
    await expect(page.getByRole('heading', { name: /payment not found/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('Payment link checkout – mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('fits a phone screen and completes the same flow', async ({ page }) => {
    test.setTimeout(90_000);
    const api = await mockCheckoutApi(page);

    await page.goto(`/pay/${PAYMENT_ID}`);
    await expectPendingCheckout(page);

    // No horizontal scrolling on a 390px-wide screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // The QR code is fully within the viewport width.
    const qrBox = await page
      .getByRole('img', { name: /QR code for Stellar payment/ })
      .boundingBox();
    expect(qrBox).not.toBeNull();
    expect(qrBox!.x).toBeGreaterThanOrEqual(0);
    expect(qrBox!.x + qrBox!.width).toBeLessThanOrEqual(390);

    api.completePayment();
    await expectSuccessAndRedirect(page);
  });
});
