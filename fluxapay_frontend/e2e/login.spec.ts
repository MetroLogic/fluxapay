import { test, expect } from "@playwright/test";

/**
 * E2E – Login flow
 * Intercepts POST /api/merchants/login (matches backend route).
 */
test.describe("Login flow", () => {
  test("@smoke - shows validation error for empty fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/email is required/i)).toBeVisible();
  });

  test("shows error for invalid credentials (mocked API)", async ({ page }) => {
    await page.route("**/api/merchants/login", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid credentials" }),
      }),
    );

    await page.goto("/login");
    await page.getByLabel(/email/i).fill("bad@example.com");
    await page.getByRole("textbox", { name: /^password$/i }).fill("wrongpass");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid credentials/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("@smoke - redirects to dashboard on successful login (mocked API)", async ({
    page,
  }) => {
    await page.route("**/api/merchants/login", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "mock-jwt-token",
          merchant: { id: "mer_1", business_name: "Test Biz" },
        }),
      }),
    );

    await page.goto("/login");
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByRole("textbox", { name: /^password$/i }).fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });
});
