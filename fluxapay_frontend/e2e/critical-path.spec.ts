import { test, expect, request as playwrightRequest } from "@playwright/test";
import {
  getBaseUrl,
  getTestEmail,
  getTestOtp,
  getTestPassword,
  isRealMode,
  getApiUrl,
} from "./helpers/mode";
import { setupMocks } from "./helpers/mocks";

const CP_MERCHANT_ID = "mer_e2e_critical";
const CP_PAYMENT_ID = "pay_e2e_critical";

test.describe("Critical path (signup → OTP → login → payment → checkout → confirm)", () => {
  test("@critical full merchant journey", async ({ page }) => {
    test.setTimeout(180_000);

    const email = getTestEmail();
    const password = getTestPassword();
    const otp = getTestOtp();
    const amount = 100;
    const currency = "USD";
    let capturedCreateBody: Record<string, unknown> | null = null;
    let statusPollCount = 0;

    await setupMocks(page, async (p) => {
      await p.route("**/api/merchants/signup", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Merchant registered. Verify OTP to activate.",
            merchantId: CP_MERCHANT_ID,
          }),
        });
      });

      await p.route("**/api/merchants/verify-otp", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Merchant verified and activated" }),
        });
      });

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

      const pendingPaymentJson = {
        id: CP_PAYMENT_ID,
        amount,
        currency,
        status: "pending",
        address: "GTESTE2E123456789012345678901234",
        merchantName: "E2E Business",
        description: "E2E critical path",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };

      // Register payment sub-routes before the broad `/api/payments` matcher (which would otherwise
      // swallow `/api/payments/:id/status` and break checkout polling).
      await p.route(`**/api/payments/${CP_PAYMENT_ID}/status`, async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        statusPollCount += 1;
        const status = statusPollCount >= 2 ? "confirmed" : "pending";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status }),
        });
      });

      await p.route(`**/api/payments/${CP_PAYMENT_ID}/stream`, async (route) => {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: "{}",
        });
      });

      await p.route(`**/api/payments/${CP_PAYMENT_ID}`, async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(pendingPaymentJson),
        });
      });

      await p.route("**/api/payments", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname !== "/api/payments") return route.continue();

        const method = route.request().method();
        if (method === "POST") {
          try {
            capturedCreateBody = route.request().postDataJSON() as Record<
              string,
              unknown
            >;
          } catch {
            capturedCreateBody = null;
          }
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
              id: CP_PAYMENT_ID,
              checkout_url: `${getBaseUrl()}/pay/${CP_PAYMENT_ID}`,
              status: "pending",
              amount,
              currency,
            }),
          });
          return;
        }
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: [
                {
                  id: CP_PAYMENT_ID,
                  amount,
                  currency,
                  status: "pending",
                  merchantId: CP_MERCHANT_ID,
                  customer_email: "",
                  createdAt: new Date().toISOString(),
                  depositAddress: "GTESTE2E123456789012345678901234",
                },
              ],
              meta: { total: 1, page: 1, limit: 20 },
            }),
          });
          return;
        }
        return route.continue();
      });
    });

    await test.step("Signup", async () => {
      await page.goto("/signup");
      await page.getByPlaceholder("Your name").fill("E2E User");
      await page.getByPlaceholder("Business name").fill("E2E Business");
      await page.getByPlaceholder("you@example.com").fill(email);
      await page.getByText("Select Country", { exact: true }).click();
      await page.getByRole("option", { name: /nigeria/i }).click();
      await page.getByPlaceholder("Bank Name").fill("Test Bank");
      await page.getByPlaceholder("Bank Code").fill("001");
      await page.getByPlaceholder("Account Number").fill("1234567890");
      await page.getByPlaceholder("Password").fill(password);
      await page.getByRole("button", { name: /create account/i }).click();
      await expect(page.getByText(/signup successful/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/verify-otp/, { timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: /verify your account/i }),
      ).toBeVisible();
    });

    await test.step("OTP verification", async () => {
      await page.getByPlaceholder("000000").fill(otp);
      await page.getByRole("button", { name: /verify account/i }).click();
      await expect(page.getByText(/account verified successfully/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    });

    await test.step("Login", async () => {
      await page.getByPlaceholder("test@gmail.com").fill(email);
      await page.getByPlaceholder("Password").fill(password);
      await page.getByRole("button", { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    });

    await test.step("Create payment", async () => {
      await page.goto("/dashboard/payments");
      await expect(
        page.getByRole("heading", { name: "Payments", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /new payment/i }).click();
      await expect(
        page.getByRole("heading", { name: /create payment link/i }),
      ).toBeVisible();
      const dialog = page.getByRole("dialog");
      await dialog.locator('input[type="number"]').fill(String(amount));
      await dialog.locator("select").selectOption(currency);
      await dialog.locator('input[type="text"]').fill("E2E critical path");
      await page.getByRole("button", { name: /generate link/i }).click();
      await expect(page.getByText(/payment link created successfully/i)).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step("Checkout pending", async () => {
      await page.goto(`/pay/${CP_PAYMENT_ID}`);
      await expect(
        page.getByRole("heading", { name: /complete your payment/i }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByText(new RegExp(`${amount}\\s*${currency}`, "i")),
      ).toBeVisible();
      await expect(page.getByText('E2E Business', { exact: true })).toBeVisible();
      if (!isRealMode() && capturedCreateBody) {
        expect(capturedCreateBody.amount).toBe(amount);
        expect(capturedCreateBody.currency).toBe(currency);
      }
    });

    await test.step("Confirm (mocked chain / status)", async () => {
      await expect(page.getByText(/payment confirmed/i)).toBeVisible({
        timeout: 20_000,
      });
    });
  });
});

test.afterAll(async () => {
  if (!isRealMode()) return;

  const adminSecret = process.env.E2E_ADMIN_SECRET;
  const merchantId = process.env.E2E_CLEANUP_MERCHANT_ID;
  if (!adminSecret || !merchantId) return;

  const ctx = await playwrightRequest.newContext({
    baseURL: getApiUrl(),
    extraHTTPHeaders: { "X-Admin-Secret": adminSecret },
  });
  try {
    await ctx.patch(`/api/v1/merchants/admin/${merchantId}/status`, {
      data: { status: "suspended" },
    });
  } catch {
    /* best-effort cleanup */
  } finally {
    await ctx.dispose();
  }
});
