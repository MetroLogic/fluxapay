import { test, expect } from "@playwright/test";
import { loginAndNavigate } from "./helpers/dashboard";
import { setupMocks } from "./helpers/mocks";

/**
 * Payments CSV export (#1216).
 *
 * The toolbar button opens the export dialog, which is seeded from the filters
 * currently applied to the table. Confirming it streams a CSV from
 * GET /api/v1/payments/export.
 *
 * Asserts the two things a unit test cannot: that the streamed request carries
 * the date range and filters the merchant picked, and that the browser
 * actually receives a CSV download.
 */

const MERCHANT_ID = "mer_e2e_export";

const PAYMENT = {
  id: "pay_e2e_export_1",
  merchantId: MERCHANT_ID,
  amount: 120,
  currency: "USDC",
  status: "paid",
  customer_email: "buyer@example.com",
  description: "Bulk export fixture",
  createdAt: "2026-02-10T10:00:00.000Z",
  transaction_hash: "tx_e2e_export_1",
};

const CSV_BODY = [
  "payment_id,merchant_id,status,amount,currency,created_at",
  `pay_e2e_export_1,${MERCHANT_ID},paid,120,USDC,2026-02-10T10:00:00.000Z`,
  "",
].join("\r\n");

test.describe("Payments CSV export", () => {
  test("exports the filtered date range as a streamed CSV download", async ({ page }) => {
    const exportUrls: string[] = [];

    await setupMocks(page, async (p) => {
      // Dashboard notifications feed (rendered by TopNav on every page).
      await p.route("**/api/v1/webhooks/logs*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { logs: [] } }),
        }),
      );
      await p.route("**/api/v1/settlements*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ settlements: [] }),
        }),
      );

      await p.route("**/api/v1/payments*", async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [PAYMENT], meta: { total: 1 } }),
        });
      });

      // Registered last so it wins over the catch-all payments route above.
      await p.route("**/api/v1/payments/export?*", async (route) => {
        exportUrls.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "text/csv; charset=utf-8",
          headers: {
            "Content-Disposition": 'attachment; filename="transactions_2026-02-28.csv"',
            "X-Export-Row-Count": "1",
          },
          body: CSV_BODY,
        });
      });
    });

    await loginAndNavigate(page, "/dashboard/payments");

    // Narrow the view so the export must carry the active filters.
    await page
      .locator('select:has(option[value="partially_paid"])')
      .selectOption("paid");
    await page.locator('select:has(option[value="EURC"])').selectOption("USDC");
    await page.getByTitle("From date").fill("2026-02-01");
    await page.getByTitle("To date").fill("2026-02-28");

    // The export button opens the date-range dialog rather than downloading
    // straight away.
    await page.getByTestId("payments-bulk-export-csv").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The dialog is seeded with the table's date range.
    await expect(dialog.getByLabel("Export start date")).toHaveValue("2026-02-01");
    await expect(dialog.getByLabel("Export end date")).toHaveValue("2026-02-28");
    await expect(dialog.getByLabel("Status")).toHaveValue("paid");
    await expect(dialog.getByLabel("Currency")).toHaveValue("USDC");
    await expect(page.getByTestId("export-date-range-summary")).toHaveText(
      "2026-02-01 to 2026-02-28",
    );

    const downloadPromise = page.waitForEvent("download");
    await dialog.getByTestId("confirm-export-csv").click();
    const download = await downloadPromise;

    // The download uses the filename the API sent back.
    expect(download.suggestedFilename()).toBe("transactions_2026-02-28.csv");

    // Exactly one streamed request, carrying the selected range and filters.
    expect(exportUrls).toHaveLength(1);
    const url = new URL(exportUrls[0]);
    expect(url.searchParams.get("date_from")).toBe("2026-02-01");
    expect(url.searchParams.get("date_to")).toBe("2026-02-28");
    expect(url.searchParams.get("status")).toBe("paid");
    expect(url.searchParams.get("currency")).toBe("USDC");

    // The merchant is told how many transactions were exported.
    await expect(page.getByText(/1 transaction exported/)).toBeVisible();
  });

  test("lets the merchant pick a preset range and blocks an inverted one", async ({ page }) => {
    const exportUrls: string[] = [];

    await setupMocks(page, async (p) => {
      await p.route("**/api/v1/webhooks/logs*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { logs: [] } }),
        }),
      );
      await p.route("**/api/v1/payments*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [PAYMENT], meta: { total: 1 } }),
        }),
      );
      await p.route("**/api/v1/payments/export?*", async (route) => {
        exportUrls.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "text/csv; charset=utf-8",
          headers: {
            "Content-Disposition": 'attachment; filename="transactions.csv"',
            "X-Export-Row-Count": "0",
          },
          body: "payment_id\n",
        });
      });
    });

    await loginAndNavigate(page, "/dashboard/payments");

    await page.getByTestId("payments-bulk-export-csv").click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Date range").selectOption("30d");
    const start = await dialog.getByLabel("Export start date").inputValue();
    const end = await dialog.getByLabel("Export end date").inputValue();
    expect(start).not.toBe("");
    expect(end).not.toBe("");

    // An inverted range is refused before any request goes out.
    await dialog.getByLabel("Export start date").fill("2026-03-31");
    await dialog.getByLabel("Export end date").fill("2026-03-01");
    await expect(page.getByTestId("export-date-range-summary")).toHaveText(
      "Start date must be on or before the end date.",
    );
    await expect(dialog.getByTestId("confirm-export-csv")).toBeDisabled();
    expect(exportUrls).toHaveLength(0);
  });
});
