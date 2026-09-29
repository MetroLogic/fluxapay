import { test, expect } from "@playwright/test";
import { loginAndNavigate } from "./helpers/dashboard";
import { setupMocks } from "./helpers/mocks";

/**
 * Payments bulk CSV export.
 *
 * Covers the full async job flow: the toolbar button starts a job, the job is
 * polled to completion, the finished payload is downloaded as a CSV, and the
 * merchant is told it is ready (toast + dashboard notification).
 *
 * Asserts the two things a unit test cannot: that the job request carries the
 * active filters (and not just the visible page), and that the browser actually
 * receives a CSV download.
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

type ExportRequestBody = {
  resource: string;
  format: string;
  filters?: Record<string, string | undefined>;
  page?: number;
  limit?: number;
};

test.describe("Payments bulk CSV export", () => {
  test("starts a job for the filtered view, downloads it, and notifies the user", async ({
    page,
  }) => {
    const exportRequests: ExportRequestBody[] = [];

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

      await p.route("**/api/v1/merchants/export", async (route) => {
        exportRequests.push(route.request().postDataJSON() as ExportRequestBody);
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({
            jobId: "job_e2e_export",
            status: "processing",
          }),
        });
      });

      await p.route(
        "**/api/v1/merchants/export/job_e2e_export",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              jobId: "job_e2e_export",
              status: "completed",
            }),
          }),
      );

      await p.route(
        "**/api/v1/merchants/export/job_e2e_export/download",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ payments_summary: { records: [PAYMENT] } }),
          }),
      );
    });

    await loginAndNavigate(page, "/dashboard/payments");

    // Narrow the view so the export must carry the active filters.
    await page
      .locator('select:has(option[value="partially_paid"])')
      .selectOption("paid");
    await page.locator('select:has(option[value="EURC"])').selectOption("USDC");
    await page.getByTitle("From date").fill("2026-02-01");
    await page.getByTitle("To date").fill("2026-02-28");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("payments-bulk-export-csv").click();
    const download = await downloadPromise;

    // The download is a CSV named for the resource and day.
    expect(download.suggestedFilename()).toMatch(
      /^payments_export_\d{4}-\d{2}-\d{2}\.csv$/,
    );

    // Exactly one job was requested, for the CSV format, carrying the filters.
    expect(exportRequests).toHaveLength(1);
    expect(exportRequests[0]).toMatchObject({
      resource: "payments",
      format: "csv",
    });
    expect(exportRequests[0].filters).toMatchObject({
      status: "paid",
      currency: "USDC",
      date_from: "2026-02-01",
      date_to: "2026-02-28",
    });
    // A bulk export must not be limited to the visible page.
    expect(exportRequests[0].page).toBeUndefined();
    expect(exportRequests[0].limit).toBeUndefined();

    // The merchant is told the export is ready.
    await expect(page.getByText(/Export ready/)).toBeVisible();

    // ...and it lands in the dashboard notification feed too.
    await page.goto("/dashboard/notifications");
    const feed = page.getByRole("region", { name: /notifications center/i });
    await expect(feed.getByText("Export ready")).toBeVisible();
  });
});
