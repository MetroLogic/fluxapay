import { test, expect } from '@playwright/test';

/**
 * Refunds pagination end-to-end (#780).
 *
 * Asserts the two things a unit test cannot: that the second page issues a
 * real request carrying `page=2`, and that it renders different rows than the
 * first — the actual symptom of a list that only ever fetched one page.
 */

const PAGE_SIZE = 20;
const TOTAL = 142;

/** Build a page of refunds whose ids identify which page they came from. */
function refundPage(page: number) {
  const startIndex = (page - 1) * PAGE_SIZE;
  return {
    refunds: Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `re_p${page}_${startIndex + i}`,
      payment_id: `pay_${startIndex + i}`,
      merchant_id: 'merch_e2e',
      amount: 100 + i,
      currency: 'USDC',
      customer_address: 'GTESTCUSTOMERADDRESS',
      reason: 'customer_request',
      status: 'completed',
      created_at: '2026-01-01T00:00:00.000Z',
    })),
    total: TOTAL,
  };
}

test.describe('Refunds pagination', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/merchants/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'merch_e2e', business_name: 'E2E Merchant' }),
      })
    );

    await page.route('**/api/refunds*', (route) => {
      const requested = Number(new URL(route.request().url()).searchParams.get('page') ?? '1');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(refundPage(requested)),
      });
    });
  });

  test('navigates to page 2 and shows different results', async ({ page }) => {
    await page.goto('/dashboard/refunds');

    await expect(page.getByText(`Showing 1–${PAGE_SIZE} of ${TOTAL}`)).toBeVisible();
    await expect(page.getByText('re_p1_0')).toBeVisible();

    await page.getByRole('button', { name: /next/i }).click();

    // The URL carries the page, so this view is linkable.
    await expect(page).toHaveURL(/[?&]page=2\b/);
    await expect(
      page.getByText(`Showing ${PAGE_SIZE + 1}–${PAGE_SIZE * 2} of ${TOTAL}`)
    ).toBeVisible();

    // Page two's rows are genuinely different, not the same slice re-rendered.
    await expect(page.getByText('re_p2_20')).toBeVisible();
    await expect(page.getByText('re_p1_0')).toHaveCount(0);
  });

  test('deep-links straight to a page', async ({ page }) => {
    await page.goto('/dashboard/refunds?page=3');

    await expect(
      page.getByText(`Showing ${PAGE_SIZE * 2 + 1}–${PAGE_SIZE * 3} of ${TOTAL}`)
    ).toBeVisible();
    await expect(page.getByText('re_p3_40')).toBeVisible();
  });

  test('requests a bounded page size rather than the whole list', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/refunds')) requests.push(req.url());
    });

    await page.goto('/dashboard/refunds');
    await expect(page.getByText(`Showing 1–${PAGE_SIZE} of ${TOTAL}`)).toBeVisible();

    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) {
      expect(new URL(url).searchParams.get('limit')).toBe(String(PAGE_SIZE));
    }
  });
});
