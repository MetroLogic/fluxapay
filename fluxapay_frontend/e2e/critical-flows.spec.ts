/**
 * Critical-path E2E tests — Issue #595
 * Covers:
 *  1. Customer completes payment via QR code checkout
 *  2. Merchant logs in and views the payment list
 *  3. Merchant creates an invoice and copies its payment link
 *  4. Merchant initiates a refund from the payment details page
 *
 * All tests run in mocked mode by default (no live backend required).
 * Set E2E_MODE=real + E2E_BASE_URL + E2E_API_URL to run against a seeded env.
 */

import { test, expect } from "@playwright/test";
import { loginAndNavigate } from "./helpers/dashboard";
import { setupMocks } from "./helpers/mocks";

// ─── Shared mock data ────────────────────────────────────────────────────────

const MERCHANT_ID = "mer_e2e_critical";
const PAYMENT_ID = "pay_e2e_001";
const REFUND_PAYMENT_ID = "pay_e2e_confirmed_001";

const mockPendingPayment = {
  id: PAYMENT_ID,
  amount: 50,
  currency: "USD",
  status: "pending",
  merchantName: "E2E Merchant",
  address: "GTEST123ABCSTELLARADDR001",
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  successUrl: null,
  memo: "PAY-E2E-001",
  memoType: "text",
  memoRequired: true,
};

const mockConfirmedPayment = {
  id: REFUND_PAYMENT_ID,
  merchantId: MERCHANT_ID,
  amount: 100,
  currency: "USD",
  status: "confirmed",
  customer_email: "customer@example.com",
  description: "E2E confirmed payment for refund",
  createdAt: new Date().toISOString(),
  stellar_address: "GTEST456DEFSTELLARADDR001",
};

// ─── 1. Customer checkout via QR code ────────────────────────────────────────

test.describe("Customer payment checkout", () => {
  test("customer sees QR code and address for a pending payment", async ({ page }) => {
    await page.route(`**/api/payments/${PAYMENT_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPendingPayment),
      }),
    );

    await page.route(`**/api/payments/${PAYMENT_ID}/status`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "pending" }),
      }),
    );

    // SSE stream — respond with empty/closed stream to fall back to polling
    await page.route(`**/api/payments/${PAYMENT_ID}/stream`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "",
      }),
    );

    await page.goto(`/pay/${PAYMENT_ID}`);

    // QR code should appear (either via role=img alt text or canvas)
    await expect(
      page
        .getByRole("img", { name: /qr code/i })
        .or(page.getByTestId("qr-canvas")),
    ).toBeVisible({ timeout: 8000 });

    // Deposit address should be displayed
    await expect(page.getByText(mockPendingPayment.address)).toBeVisible({
      timeout: 5000,
    });

    // Memo should be required
    await expect(page.getByText(/memo required/i)).toBeVisible({ timeout: 5000 });
  });

  test("customer sees confirmed state when payment is paid", async ({ page }) => {
    await page.route(`**/api/payments/${PAYMENT_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockPendingPayment, status: "confirmed" }),
      }),
    );

    await page.goto(`/pay/${PAYMENT_ID}`);

    await expect(
      page.getByText(/payment confirmed/i),
    ).toBeVisible({ timeout: 8000 });
  });

  test("QR code and copy field update when deposit address changes via polling", async ({
    page,
  }) => {
    const initialAddress = "GINITIALADDR001STELLAR";
    const updatedAddress = "GUPDATEDADDR002STELLAR";
    let callCount = 0;

    await page.route(`**/api/payments/${PAYMENT_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockPendingPayment, address: initialAddress }),
      }),
    );

    // First poll returns same status; second returns new address
    await page.route(`**/api/payments/${PAYMENT_ID}/status`, (route) => {
      callCount += 1;
      const address = callCount >= 2 ? updatedAddress : initialAddress;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "pending", address }),
      });
    });

    await page.route(`**/api/payments/${PAYMENT_ID}/stream`, (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }),
    );

    await page.goto(`/pay/${PAYMENT_ID}`);

    // Initial address shown
    await expect(page.getByText(initialAddress)).toBeVisible({ timeout: 8000 });

    // Wait for address update toast
    await expect(page.getByText(/address updated/i)).toBeVisible({
      timeout: 15000,
    });

    // Updated address now shown
    await expect(page.getByText(updatedAddress)).toBeVisible({ timeout: 5000 });
  });
});

// ─── 2. Merchant logs in and views payment list ───────────────────────────────

test.describe("Merchant payment dashboard", () => {
  const mockPayments = [
    {
      id: "pay_001",
      amount: 100,
      currency: "USD",
      status: "confirmed",
      customer_email: "alice@example.com",
      description: "Order #1",
      createdAt: new Date().toISOString(),
    },
    {
      id: "pay_002",
      amount: 250,
      currency: "USD",
      status: "pending",
      customer_email: "bob@example.com",
      description: "Order #2",
      createdAt: new Date().toISOString(),
    },
  ];

  test("merchant logs in and sees payment list", async ({ page }) => {
    await setupMocks(page, async (p) => {
      await p.route("**/api/v1/payments*", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: { payments: mockPayments },
            meta: { page: 1, limit: 20, total: mockPayments.length },
          }),
        });
      });
    });

    await loginAndNavigate(page, "/dashboard/payments");

    // Payments heading should be visible
    await expect(
      page.getByRole("heading", { name: /payments/i }),
    ).toBeVisible({ timeout: 10000 });

    // At least one payment row visible
    await expect(page.getByText("alice@example.com")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByText("bob@example.com")).toBeVisible({
      timeout: 8000,
    });
  });
});

// ─── 3. Merchant creates invoice and copies payment link ──────────────────────
// (Covered thoroughly in invoices.spec.ts — this test verifies the critical path
//  from the consolidated critical-flows file.)

test.describe("Invoice creation — critical path", () => {
  const mockInvoices: {
    id: string;
    invoice_number: string;
    customer_email: string;
    amount: number;
    currency: string;
    due_date: string;
    status: string;
    payment_link: string;
    created_at: string;
  }[] = [];

  test("merchant creates invoice and payment link is available to copy", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const customerEmail = `critical-${Date.now()}@example.com`;

    await setupMocks(page, async (p) => {
      await p.route("**/api/v1/invoices*", async (route) => {
        const method = route.request().method();
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: { invoices: mockInvoices },
              meta: { page: 1, limit: 20, total: mockInvoices.length },
            }),
          });
        } else if (method === "POST") {
          const body = route.request().postDataJSON();
          const newInvoice = {
            id: `inv_critical_${Date.now()}`,
            invoice_number: `INV-CRIT-001`,
            customer_email: body.customer_email ?? customerEmail,
            amount: body.amount ?? 200,
            currency: body.currency ?? "USD",
            due_date: body.due_date ?? new Date().toISOString(),
            status: "pending",
            payment_link: `http://localhost:3075/pay/invoice/inv_critical_${Date.now()}`,
            created_at: new Date().toISOString(),
          };
          mockInvoices.unshift(newInvoice);
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ message: "Invoice created", invoice: newInvoice }),
          });
        } else {
          await route.continue();
        }
      });
    });

    await loginAndNavigate(page, "/dashboard/invoices");

    await expect(
      page.getByRole("heading", { name: "Invoices", exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /create invoice/i }).click();

    // Fill form
    await page.getByPlaceholder("Jane Doe").fill("Critical Test Client");
    await page.getByPlaceholder("jane@example.com").fill(customerEmail);

    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await page.locator('input[type="date"]').fill(formattedDate);

    await page.getByPlaceholder("Description").fill("Critical E2E Service");
    await page.getByPlaceholder("Qty").fill("2");
    await page.getByPlaceholder("Unit price").fill("100");

    await page.getByRole("button", { name: /^create invoice$/i }).click();

    // Invoice row should appear
    const tableRow = page.getByRole("row").filter({ hasText: customerEmail });
    await expect(tableRow).toBeVisible({ timeout: 10000 });

    // Copy payment link
    const copyButton = tableRow.getByTitle("Copy Payment Link");
    await copyButton.click();

    const clipboardContent = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardContent).toContain("/pay/invoice/");
  });
});

// ─── 4. Merchant initiates refund from payment details ────────────────────────

test.describe("Refund initiation", () => {
  test("merchant can initiate a refund from the payment details page", async ({
    page,
  }) => {
    await setupMocks(page, async (p) => {
      // Payment detail route
      await p.route(`**/api/v1/payments/${REFUND_PAYMENT_ID}`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ payment: mockConfirmedPayment }),
        });
      });

      // Refund creation route
      await p.route(
        `**/api/v1/payments/${REFUND_PAYMENT_ID}/refunds`,
        async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
              message: "Refund initiated",
              refund: {
                id: "ref_e2e_001",
                paymentId: REFUND_PAYMENT_ID,
                amount: 100,
                status: "pending",
              },
            }),
          });
        },
      );

      // Refund list route (used after initiation)
      await p.route(
        `**/api/v1/payments/${REFUND_PAYMENT_ID}/refunds`,
        async (route) => {
          if (route.request().method() !== "GET") return route.continue();
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ refunds: [] }),
          });
        },
      );
    });

    await loginAndNavigate(
      page,
      `/dashboard/payments/${REFUND_PAYMENT_ID}`,
    );

    // Refund button should be visible on a confirmed payment
    const refundButton = page.getByRole("button", { name: /refund/i }).first();
    await expect(refundButton).toBeVisible({ timeout: 10000 });

    await refundButton.click();

    // Confirm dialog / modal should appear
    const confirmButton = page
      .getByRole("button", { name: /confirm refund/i })
      .or(page.getByRole("button", { name: /submit refund/i }))
      .or(page.getByRole("button", { name: /proceed/i }));

    // If a confirmation dialog appears, click it
    if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Success indicator: toast or status update
    await expect(
      page
        .getByText(/refund initiated/i)
        .or(page.getByText(/refund.*pending/i))
        .or(page.getByText(/refund.*submitted/i)),
    ).toBeVisible({ timeout: 10000 });
  });
});
