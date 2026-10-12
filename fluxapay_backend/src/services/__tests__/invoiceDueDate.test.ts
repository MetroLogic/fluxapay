const mockCreate = jest.fn();

jest.mock("../../config/prisma", () => ({
  prisma: {
    invoice: {
      create: (...args: any[]) => mockCreate(...args),
    },
  },
}));

jest.mock("../webhook.service", () => ({
  createAndDeliverWebhook: jest.fn(),
}));

jest.mock("../invoicePdf.service", () => ({
  startInvoicePdfGeneration: jest.fn(),
}));

jest.mock("../email.service", () => ({
  sendInvoiceEmail: jest.fn(),
}));

import { createInvoiceService } from "../invoice.service";

describe("createInvoiceService - due_date validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a due_date in the past with a 400 error", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await expect(
      createInvoiceService({
        merchantId: "merchant_1",
        currency: "USDC",
        customer_email: "customer@example.com",
        amount: 100,
        due_date: pastDate,
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an invalid due_date value with a 400 error", async () => {
    await expect(
      createInvoiceService({
        merchantId: "merchant_1",
        currency: "USDC",
        customer_email: "customer@example.com",
        amount: 100,
        due_date: "not-a-date",
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("allows a due_date in the future", async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    mockCreate.mockResolvedValueOnce({
      id: "inv_1",
      invoice_number: "INV-20260101-ABC123",
      amount: 10000,
      currency: "USDC",
      status: "draft",
      due_date: new Date(futureDate),
    });

    await expect(
      createInvoiceService({
        merchantId: "merchant_1",
        currency: "USDC",
        customer_email: "customer@example.com",
        amount: 100,
        due_date: futureDate,
      }),
    ).resolves.toMatchObject({ message: "Invoice created in draft status" });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
