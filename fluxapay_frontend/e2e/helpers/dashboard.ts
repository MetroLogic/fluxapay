import { Page, expect } from "@playwright/test";
import { getTestEmail, getTestPassword, isRealMode } from "./mode";
import { setupMocks } from "./mocks";

const CP_MERCHANT_ID = "mer_e2e_critical";

export async function loginAndNavigate(page: Page, path: string): Promise<void> {
  const email = getTestEmail();
  const password = getTestPassword();

  // Setup basic mock routes for authentication if not in real mode
  await setupMocks(page, async (p) => {
    await p.route("**/api/merchants/login", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Login successful",
          merchantId: CP_MERCHANT_ID,
          token: "mock-jwt-e2e-critical",
        }),
      });
    });

    await p.route("**/api/merchants/me", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: CP_MERCHANT_ID,
          business_name: "E2E Business",
          email,
        }),
      });
    });
  });

  // Navigate to login and submit credentials
  await page.goto("/login");
  await page.getByPlaceholder("test@gmail.com").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for login redirection
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // Navigate to the target path
  await page.goto(path);
}
