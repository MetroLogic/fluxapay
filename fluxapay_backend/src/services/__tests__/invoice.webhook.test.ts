import { prisma } from "../../config/prisma";
import { updateInvoiceStatusService } from "../invoice.service";

/**
 * Invoice Paid Webhook Tests
 *
 * Tests that verify the invoice.paid webhook is emitted when an invoice
 * transitions to paid status, including the correct payload fields.
 */
describe("Invoice Webhook - invoice.paid", () => {
  const merchantId = "invoice-webhook-test-merchant";
  const invoiceId = "invoice-webhook-test-id";

  beforeAll(async () => {
    // Create test merchant
    await prisma.merchant.upsert({
      where: { email: "invoice-webhook-test@example.com" },
      update: {},
      create: {
        id: merchantId,
        business_name: "Invoice Webhook Test Merchant",
        email: "invoice-webhook-test@example.com",
        phone_number: "+1234567890",
        country: "US",
        settlement_currency: "USD",
        webhook_url: "https://example.com/webhook",
        webhook_secret: "test-secret",
        password: "test-password",
      },
    });

    // Create test invoice in "sent" status
    await prisma.invoice.upsert({
      where: { id: invoiceId },
      update: {},
      create: {
        id: invoiceId,
        merchantId,
        invoice_number: "INV-2026-01-TEST",
        amount: 100000,
        currency: "USD",
        customer_email: "customer@example.com",
        payment_link: "https://example.com/pay/test",
        status: "sent",
      },
    });
  });

  afterAll(async () => {
    // Cleanup webhook logs
    await prisma.webhookLog.deleteMany({
      where: { merchantId },
    });
    // Cleanup invoice
    await prisma.invoice.delete({
      where: { id: invoiceId },
    });
    // Cleanup merchant
    await prisma.merchant.delete({
      where: { id: merchantId },
    });
  });

  describe("updateInvoiceStatusService", () => {
    it("should set paid_at timestamp when marking invoice as paid", async () => {
      const beforeUpdate = new Date();

      const result = await updateInvoiceStatusService(merchantId, invoiceId, "paid");

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
      });

      expect(updatedInvoice?.status).toBe("paid");
      expect(updatedInvoice?.paid_at).toBeDefined();
      expect(updatedInvoice?.paid_at?.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it("should emit webhook when invoice transitions to paid", async () => {
      // Create another invoice for this test
      const testInvoiceId = "invoice-webhook-emit-test";
      await prisma.invoice.create({
        data: {
          id: testInvoiceId,
          merchantId,
          invoice_number: "INV-2026-02-TEST",
          amount: 50000,
          currency: "USD",
          customer_email: "customer2@example.com",
          payment_link: "https://example.com/pay/test2",
          status: "sent",
        },
      });

      await updateInvoiceStatusService(merchantId, testInvoiceId, "paid");

      // Verify webhook log was created
      const webhookLog = await prisma.webhookLog.findFirst({
        where: {
          merchantId,
          event_type: "invoice_paid",
          payment_id: testInvoiceId,
        },
      });

      expect(webhookLog).toBeDefined();
      expect(webhookLog?.event_type).toBe("invoice_paid");
      expect(webhookLog?.status).toBe("pending");

      // Verify webhook payload includes required fields
      const payload = webhookLog?.request_payload as any;
      expect(payload.event).toBe("invoice.paid");
      expect(payload.invoice_id).toBe(testInvoiceId);
      expect(payload.merchant_id).toBe(merchantId);
      expect(payload.amount).toBeDefined();
      expect(payload.currency).toBe("USD");
      expect(payload.status).toBe("paid");
      expect(payload.paid_at).toBeDefined();
      expect(payload.updated_at).toBeDefined();

      // Cleanup
      await prisma.webhookLog.deleteMany({
        where: { merchantId },
      });
      await prisma.invoice.delete({
        where: { id: testInvoiceId },
      });
    });

    it("should include payment_tx_hash when payment is linked", async () => {
      // Create payment with transaction hash
      const payment = await prisma.payment.create({
        data: {
          merchantId,
          amount: 75000,
          currency: "USD",
          customer_email: "customer3@example.com",
          status: "confirmed",
          transaction_hash: "stellar_tx_abc123def456",
        },
      });

      // Create invoice linked to payment
      const testInvoiceId = "invoice-webhook-txhash-test";
      await prisma.invoice.create({
        data: {
          id: testInvoiceId,
          merchantId,
          invoice_number: "INV-2026-03-TEST",
          amount: 75000,
          currency: "USD",
          customer_email: "customer3@example.com",
          payment_link: "https://example.com/pay/test3",
          status: "sent",
          payment_id: payment.id,
        },
      });

      await updateInvoiceStatusService(merchantId, testInvoiceId, "paid");

      // Verify webhook payload includes payment_tx_hash
      const webhookLog = await prisma.webhookLog.findFirst({
        where: {
          merchantId,
          event_type: "invoice_paid",
          payment_id: testInvoiceId,
        },
      });

      const payload = webhookLog?.request_payload as any;
      expect(payload.payment_tx_hash).toBe("stellar_tx_abc123def456");

      // Cleanup
      await prisma.webhookLog.deleteMany({
        where: { merchantId },
      });
      await prisma.invoice.delete({
        where: { id: testInvoiceId },
      });
      await prisma.payment.delete({
        where: { id: payment.id },
      });
    });

    it("should emit webhook for invoice.overdue transition", async () => {
      // Create invoice
      const testInvoiceId = "invoice-overdue-webhook-test";
      await prisma.invoice.create({
        data: {
          id: testInvoiceId,
          merchantId,
          invoice_number: "INV-2026-04-TEST",
          amount: 125000,
          currency: "USD",
          customer_email: "customer4@example.com",
          payment_link: "https://example.com/pay/test4",
          status: "sent",
        },
      });

      await updateInvoiceStatusService(merchantId, testInvoiceId, "overdue");

      // Verify webhook log was created for overdue event
      const webhookLog = await prisma.webhookLog.findFirst({
        where: {
          merchantId,
          event_type: "invoice_overdue",
          payment_id: testInvoiceId,
        },
      });

      expect(webhookLog).toBeDefined();
      const payload = webhookLog?.request_payload as any;
      expect(payload.event).toBe("invoice.overdue");

      // Cleanup
      await prisma.webhookLog.deleteMany({
        where: { merchantId },
      });
      await prisma.invoice.delete({
        where: { id: testInvoiceId },
      });
    });
  });
});
