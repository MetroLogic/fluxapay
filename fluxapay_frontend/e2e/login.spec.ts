import { test, expect } from "@playwright/test";

/**
 * E2E – Login flow
 * Intercepts POST /api/merchants/login (matches backend route).
 */
test.describe("Login flow", () => {
  test("@smoke - shows validation error for empty fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /login/i }).click();
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
    await page.getByRole("button", { name: /login/i }).click();

    await expect(page.getByText(/invalid credentials/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("@smoke - redirects to dashboard on successful login (mocked API)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      navigator.serviceWorker?.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister();
        }
      });

      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");

        if (url.includes("/api/merchants/login") && method === "POST") {
          return new Response(
            JSON.stringify({
              token: "mock-jwt-token",
              message: "Login successful",
              merchantId: "mer_1",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return originalFetch(input, init);
      };
    });

    await page.goto("/login");
    await page.locator('input[name="email"]').fill("test@example.com");
    await page.locator('input[name="password"]').fill("password123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              localStorage.getItem("token") ?? sessionStorage.getItem("token"),
          ),
        { timeout: 15000 },
    await page.route("**/api/merchants/login", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          token: "mock-jwt-token",
          message: "Login successful",
          merchantId: "mer_1",
        }),
      }),
    );

    await page.goto("/login");
    await page.getByLabel(/email/i).fill("test@example.com");
    await page.getByRole("textbox", { name: /^password$/i }).fill("password123");
    await page.getByRole("button", { name: /login/i }).click();

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            localStorage.getItem("token") ?? sessionStorage.getItem("token"),
        ),
      )
      .toBe("mock-jwt-token");
  });
});
