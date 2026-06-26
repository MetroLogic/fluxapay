import { test, expect } from "@playwright/test";
import { loginAndNavigate } from "./helpers/dashboard";
import { isRealMode } from "./helpers/mode";
import { setupMocks } from "./helpers/mocks";

test.describe("Invoice creation flow", () => {
  test("@smoke - can create an invoice and copy its payment link", async ({ page, context }) => {
    // Grant clipboard read/write permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const customerName = "Test Client";
    const customerEmail = `client-${Date.now()}@example.com`;
    const lineItemDesc = "Consulting Services";
    const qty = "5";
    const price = "100";

    const mockInvoices: any[] = [
      {
        id: "inv_existing",
        invoice_number: "INV-001",
        customer_email: "existing@example.com",
        amount: 150,
        currency: "USD",
        due_date: new Date(Date.now() + 86400000 * 7).toISOString(),
        status: "pending",
        payment_link: "http://localhost:3075/pay/invoice/inv_existing",
        created_at: new Date().toISOString(),
      },
    ];

    // Setup mocks if not in real mode
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
            id: `inv_${Math.random().toString(36).substring(2, 9)}`,
            invoice_number: `INV-00${mockInvoices.length + 1}`,
            customer_email: body.customer_email,
            amount: body.amount || 500,
            currency: body.currency || "USD",
            due_date: body.due_date || new Date().toISOString(),
            status: "pending",
            payment_link: `http://localhost:3075/pay/invoice/mocked_link_${Date.now()}`,
            created_at: new Date().toISOString(),
          };
          mockInvoices.unshift(newInvoice); // Prepend so it appears first
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
              message: "Invoice created successfully",
              invoice: newInvoice,
            }),
          });
        } else {
          await route.continue();
        }
      });
    });

    // Login and navigate directly to invoices dashboard
    await loginAndNavigate(page, "/dashboard/invoices");

    // Expect list to load
    await expect(page.getByRole("heading", { name: "Invoices", exact: true })).toBeVisible();

    // Click on Create Invoice button
    await page.getByRole("button", { name: /create invoice/i }).click();

    // Fill in invoice form details
    await page.getByPlaceholder("Jane Doe").fill(customerName);
    await page.getByPlaceholder("jane@example.com").fill(customerEmail);

    // Get today's date formatted as YYYY-MM-DD
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const formattedDate = `${yyyy}-${mm}-${dd}`;
    await page.locator('input[type="date"]').fill(formattedDate);

    // Line item fields
    await page.getByPlaceholder("Description").fill(lineItemDesc);
    await page.getByPlaceholder("Qty").fill(qty);
    await page.getByPlaceholder("Unit price").fill(price);

    // Submit form
    await page.getByRole("button", { name: /^create invoice$/i }).click();

    // Verify invoice appeared in table
    const tableRow = page.getByRole("row").filter({ hasText: customerEmail });
    await expect(tableRow).toBeVisible({ timeout: 10_000 });

    // Copy payment link
    const copyButton = tableRow.getByTitle("Copy Payment Link");
    await copyButton.click();

    // Verify clipboard content
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toContain("/pay/invoice/");
  });
});
