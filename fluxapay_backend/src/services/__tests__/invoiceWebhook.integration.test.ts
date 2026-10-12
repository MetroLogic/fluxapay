import { PrismaClient } from "../../generated/client/client";
import { markInvoicePaidForPaymentService } from "../invoice.service";

const prisma = new PrismaClient();
const merchantId = "invoice-webhook-integration-merchant";

describe("invoice paid webhook integration", () => {
  beforeEach(async () => {
    await prisma.webhookRetryAttempt.deleteMany({ where: { webhookLog: { merchantId } } });
    await prisma.webhookLog.deleteMany({ where: { merchantId } });
    await prisma.invoice.deleteMany({ where: { merchantId } });
    await prisma.payment.deleteMany({ where: { merchantId } });
    await prisma.merchant.deleteMany({ where: { id: merchantId } });

    await prisma.merchant.create({
      data: {
        id: merchantId,
        business_name: "Invoice Integration Merchant",
        email: "invoice-webhook-integration@example.com",
        phone_number: "+15555550123",
        country: "US",
        settlement_currency: "USD",
        webhook_url: "https://merchant.example/webhook",
        webhook_secret: "integration-secret",
        password: "hashed-password",
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists an invoice.paid delivery when the linked payment is confirmed", async () => {
    const payment = await prisma.payment.create({
      data: {
        merchantId,
        amount: 100,
        currency: "USDC",
        customer_email: "customer@example.com",
        metadata: {},
        expiration: new Date(Date.now() + 86_400_000),
        checkout_url: "https://merchant.example/pay/pay-invoice-1",
        transaction_hash: "tx_invoice_123",
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        merchantId,
        invoice_number: "INV-INTEGRATION-001",
        amount: 100,
        currency: "USDC",
        customer_email: "customer@example.com",
        payment_id: payment.id,
        payment_link: "/pay/pay-invoice-1",
        status: "sent",
      },
    });

    await markInvoicePaidForPaymentService(merchantId, payment.id);

    const delivery = await prisma.webhookLog.findFirst({
      where: { merchantId, event_type: "invoice_paid", payment_id: payment.id },
    });
    expect(delivery).toEqual(expect.objectContaining({
      event_type: "invoice_paid",
      payment_id: payment.id,
    }));
    expect(delivery?.request_payload).toEqual(expect.objectContaining({
      event: "invoice.paid",
      invoice_id: invoice.id,
      merchant_id: merchantId,
      payment_tx_hash: "tx_invoice_123",
    }));
  });
});