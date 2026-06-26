import { test, expect } from "@playwright/test";
import { loginAndNavigate } from "./helpers/dashboard";
import { setupMocks } from "./helpers/mocks";

test.describe("Payment links flow", () => {
  test("@smoke - can create and delete a payment link", async ({ page }) => {
    const linkLabel = "E2E Product Link";
    const amount = "29.99";

    const mockLinks: any[] = [
      {
        id: "link_existing",
        slug: "exist1",
        label: "Existing Product",
        amount: 49.99,
        currency: "USD",
        created_at: new Date().toISOString(),
        clicks: 2,
        conversions: 1,
        active: true,
      },
    ];

    // Setup mocks if not in real mode
    await setupMocks(page, async (p) => {
      await p.route("**/api/links", async (route) => {
        const method = route.request().method();
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(mockLinks),
          });
        } else if (method === "POST") {
          const body = route.request().postDataJSON();
          const newLink = {
            id: `link_${Math.random().toString(36).substring(2, 9)}`,
            slug: Math.random().toString(36).substring(2, 8),
            label: body.label,
            amount: Number(body.amount),
            currency: body.currency || "USD",
            created_at: new Date().toISOString(),
            clicks: 0,
            conversions: 0,
            active: true,
          };
          mockLinks.push(newLink);
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify(newLink),
          });
        } else {
          await route.continue();
        }
      });

      await p.route(/\/api\/links\/[^/]+$/, async (route) => {
        const method = route.request().method();
        if (method === "DELETE") {
          const url = route.request().url();
          const id = url.substring(url.lastIndexOf("/") + 1);
          const idx = mockLinks.findIndex((l) => l.id === id);
          if (idx !== -1) {
            mockLinks.splice(idx, 1);
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
          });
        } else {
          await route.continue();
        }
      });
    });

    // Handle browser confirm dialog for deletion
    page.on("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });

    // Login and navigate directly to payment links dashboard
    await loginAndNavigate(page, "/dashboard/payment-links");

    // Expect dashboard list to load
    await expect(page.getByRole("heading", { name: "Payment Links", exact: true })).toBeVisible();

    // Fill out creation form
    await page.getByPlaceholder("Link label (e.g. Product A)").fill(linkLabel);
    await page.getByPlaceholder("Amount (USD)").fill(amount);

    // Submit form to create
    await page.getByRole("button", { name: /create link/i }).click();

    // Verify the new link appeared in the list
    const linkRow = page.getByRole("row").filter({ hasText: linkLabel });
    await expect(linkRow).toBeVisible({ timeout: 10_000 });

    // Click delete action
    const deleteButton = linkRow.getByTitle("Delete");
    await deleteButton.click();

    // Verify the link is removed from the table list
    await expect(linkRow).not.toBeVisible({ timeout: 10_000 });
  });
});
