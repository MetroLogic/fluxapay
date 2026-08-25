jest.mock("../../generated/client/client", () => {
  const invoiceFindFirst = jest.fn();
  const invoiceUpdateMany = jest.fn();
  return {
    PrismaClient: jest.fn(() => ({
      invoice: {
        findFirst: invoiceFindFirst,
        updateMany: invoiceUpdateMany,
      },
    })),
  };
});

const mockCreateAndDeliverWebhook = jest.fn();
jest.mock("../webhook.service", () => ({
  createAndDeliverWebhook: (...args: any[]) => mockCreateAndDeliverWebhook(...args),
}));

import { PrismaClient } from "../../generated/client/client";
import { markInvoicePaidForPaymentService } from "../invoice.service";

const prisma = new PrismaClient() as any;
const invoiceFindFirst = prisma.invoice.findFirst as jest.Mock;
const invoiceUpdateMany = prisma.invoice.updateMany as jest.Mock;

describe("markInvoicePaidForPaymentService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks a linked invoice paid and emits invoice.paid with payment details", async () => {
    const paidAt = new Date("2026-08-25T12:00:00.000Z");
    invoiceUpdateMany.mockResolvedValue({ count: 1 });
    invoiceFindFirst.mockResolvedValue({
      id: "inv_123",
      amount: { toString: () => "10000" },
      currency: "USDC",
      updated_at: paidAt,
      payment: { transaction_hash: "tx_123" },
    });

    await markInvoicePaidForPaymentService("merchant_123", "pay_123");

    expect(invoiceUpdateMany).toHaveBeenCalledWith({
      where: {
        merchantId: "merchant_123",
        payment_id: "pay_123",
        status: { in: ["sent", "overdue"] },
      },
      data: { status: "paid" },
    });
    expect(mockCreateAndDeliverWebhook).toHaveBeenCalledWith(
      "merchant_123",
      "invoice_paid",
      {
        event: "invoice.paid",
        invoice_id: "inv_123",
        merchant_id: "merchant_123",
        amount: "10000",
        currency: "USDC",
        paid_at: paidAt.toISOString(),
        payment_tx_hash: "tx_123",
      },
      "pay_123",
    );
  });

  it("does not emit when the invoice was already paid", async () => {
    invoiceUpdateMany.mockResolvedValue({ count: 0 });

    await markInvoicePaidForPaymentService("merchant_123", "pay_123");

    expect(invoiceFindFirst).not.toHaveBeenCalled();
    expect(mockCreateAndDeliverWebhook).not.toHaveBeenCalled();
  });
});