import { test, expect } from "@playwright/test";

/**
 * E2E – Admin sweep page access control (#792)
 * Asserts that a non-admin user who navigates directly to /admin/sweep
 * is redirected to /login rather than seeing an empty page.
 */
test.describe("Admin sweep page access control", () => {
  test("non-admin user navigating to /admin/sweep is redirected to /login", async ({
    page,
  }) => {
    // Simulate a non-admin user: no admin flag, no auth token in storage.
    await page.addInitScript(() => {
      localStorage.removeItem("isAdmin");
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
    });

    // Guard against any real network call reaching the backend by mocking
    // the sweep status endpoint to return 403 — matching the issue scenario.
    await page.route("**/api/admin/sweep/status", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ message: "Forbidden" }),
      }),
    );

    await page.goto("/admin/sweep");

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
