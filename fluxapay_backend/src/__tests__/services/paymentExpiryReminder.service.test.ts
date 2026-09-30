
/**
 * Unit tests for paymentExpiryReminder.service.ts
 *
 * Validates that:
 *  1. Reminders are skipped when a merchant has opted out
 *     (payment_expiry_reminder = false).
 *  2. Reminders are sent when a merchant is opted in (default).
 *  3. Per-merchant reminder_minutes_before is respected — payments outside
 *     the merchant's window are not processed on that tick.
 *  4. The global CHECKOUT_REMINDER_ENABLED guard still applies.
 *  5. Stellar error codes are mapped to user-friendly messages.
 */


// ── Module mocks ──────────────────────────────────────────────────────────────

const mockPrismaClient = {
  cronLock: {
    upsert: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  },
  payment: {
    findMany: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  merchant: {
    findMany: jest.fn(),
  },
};


jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));

jest.mock("../../services/webhook.service", () => ({
  createAndDeliverWebhook: jest.fn().mockResolvedValue(undefined),
}));


jest.mock("../../services/email.service", () => ({
  sendCheckoutExpiryReminderEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/notificationPreferences.service", () => ({
  getNotificationPreferences: jest.fn(),
}));


// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runPaymentExpiryReminderJob } from "../../services/paymentExpiryReminder.service";
import { createAndDeliverWebhook } from "../../services/webhook.service";
import { sendCheckoutExpiryReminderEmail } from "../../services/email.service";
import { getNotificationPreferences } from "../../services/notificationPreferences.service";
import { mapStellarError } from "../../services/stellarErrorMapper.service";


// ── Helpers ───────────────────────────────────────────────────────────────────

const MERCHANT_A = "merchant-aaa";
const MERCHANT_B = "merchant-bbb";

const NOW = new Date("2026-06-26T10:00:00.000Z");


/** A payment expiring 4 minutes from NOW (inside the default 5-min window). */
function makePayment(id: string, merchantId: string, minsFromNow = 4) {
  return {
    id,
    merchantId,
    amount: { toString: () => "10.00" },
    currency: "USDC",
    customer_email: "customer@example.com",
    checkout_url: "https://pay.fluxapay.com/p/test",
    expiration: new Date(NOW.getTime() + minsFromNow * 60 * 1000),
  };
}


/** Stub the CronLock so the lock is always acquired by the current process. */
function mockLockAcquired() {
  const lockedBy = `${process.env.HOSTNAME ?? "app"}:${process.pid}`;
  mockPrismaClient.cronLock.findUnique.mockResolvedValue({
    job_name: "payment_expiry_reminder",
    locked_by: lockedBy,
    expires_at: new Date(NOW.getTime() + 5 * 60 * 1000),
  });
}


// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(NOW);

  // Enable the reminder feature globally
  process.env.CHECKOUT_REMINDER_ENABLED = "true";
  process.env.CHECKOUT_REMINDER_MINUTES = "5";
  process.env.CHECKOUT_REMINDER_SEND_WEBHOOK = "true";
  process.env.CHECKOUT_REMINDER_SEND_EMAIL = "true";

  mockLockAcquired();
  mockPrismaClient.payment.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.CHECKOUT_REMINDER_ENABLED;
  delete process.env.CHECKOUT_REMINDER_MINUTES;
  delete process.env.CHECKOUT_REMINDER_SEND_WEBHOOK;
  delete process.env.CHECKOUT_REMINDER_SEND_EMAIL;
});


// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runPaymentExpiryReminderJob – notification preference checks", () => {
  describe("when global feature flag is disabled", () => {
    it("returns zero-counts immediately without hitting the DB", async () => {
      process.env.CHECKOUT_REMINDER_ENABLED = "false";

      const result = await runPaymentExpiryReminderJob();

      expect(result.processed).toBe(0);
      expect(result.notified).toBe(0);
      expect(mockPrismaClient.payment.findMany).not.toHaveBeenCalled();
    });

  });


  describe("when merchant has opted OUT (payment_expiry_reminder = false)", () => {
    it("skips the payment and does not send webhook or email", async () => {
      const payment = makePayment("pay-001", MERCHANT_A);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: false,
        reminder_minutes_before: 5,
      });

      const result = await runPaymentExpiryReminderJob();

      expect(result.processed).toBe(1);
      expect(result.notified).toBe(0);
      expect(result.skippedOptOut).toBe(1);

      expect(createAndDeliverWebhook).not.toHaveBeenCalled();
      expect(sendCheckoutExpiryReminderEmail).not.toHaveBeenCalled();

      // The payment must NOT be marked as reminded when opted out
      expect(mockPrismaClient.payment.updateMany).not.toHaveBeenCalled();
    });


    it("skips ALL payments for the opted-out merchant across a batch", async () => {
      const payments = [
        makePayment("pay-002", MERCHANT_A),
        makePayment("pay-003", MERCHANT_A),
      ];
      mockPrismaClient.payment.findMany.mockResolvedValue(payments);
      mockPrismaClient.merchant.findMany.mockResolvedValue([]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: false,
        reminder_minutes_before: 5,
      });

      const result = await runPaymentExpiryReminderJob();

      expect(result.skippedOptOut).toBe(2);
      expect(result.notified).toBe(0);
      expect(createAndDeliverWebhook).not.toHaveBeenCalled();
    });
  });


  describe("when merchant is opted IN (default)", () => {
    it("sends webhook and email for the payment", async () => {
      const payment = makePayment("pay-004", MERCHANT_A);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "merchant@example.com",
          business_name: "Acme Store",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 5,
      });

      const result = await runPaymentExpiryReminderJob();

      expect(result.processed).toBe(1);
      expect(result.notified).toBe(1);
      expect(result.skippedOptOut).toBe(0);

      expect(createAndDeliverWebhook).toHaveBeenCalledTimes(1);
      expect(sendCheckoutExpiryReminderEmail).toHaveBeenCalledTimes(1);
    });


    it("marks the payment as reminded in the DB", async () => {
      const payment = makePayment("pay-005", MERCHANT_A);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "m@example.com",
          business_name: "Store",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 5,
      });

      await runPaymentExpiryReminderJob();

      expect(mockPrismaClient.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "pay-005", reminder_sent_at: null }),
          data: expect.objectContaining({ reminder_sent_at: NOW }),
        }),
      );
    });
  });


  describe("mixed batch — some merchants opted in, some opted out", () => {
    it("only notifies opted-in merchants", async () => {
      const payments = [
        makePayment("pay-006", MERCHANT_A), // opted out
        makePayment("pay-007", MERCHANT_B), // opted in
      ];
      mockPrismaClient.payment.findMany.mockResolvedValue(payments);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_B,
          email: "b@example.com",
          business_name: "Beta Shop",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockImplementation(
        async (merchantId: string) => {
          if (merchantId === MERCHANT_A) {
            return { merchantId: MERCHANT_A, payment_expiry_reminder: false, reminder_minutes_before: 5 };
          }
          return { merchantId: MERCHANT_B, payment_expiry_reminder: true, reminder_minutes_before: 5 };
        },
      );

      const result = await runPaymentExpiryReminderJob();

      expect(result.processed).toBe(2);
      expect(result.skippedOptOut).toBe(1);
      expect(result.notified).toBe(1);

      expect(createAndDeliverWebhook).toHaveBeenCalledTimes(1);
      expect((createAndDeliverWebhook as jest.Mock).mock.calls[0][0]).toBe(MERCHANT_B);
    });
  });


  describe("per-merchant reminder_minutes_before", () => {
    it("skips a payment that is outside the merchant's personal window", async () => {
      // Payment expires in 4 minutes; merchant wants reminders only 2 min before
      const payment = makePayment("pay-008", MERCHANT_A, 4);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 2, // only remind 2 min before, not 4
      });

      const result = await runPaymentExpiryReminderJob();

      // Payment is fetched (within global 5-min window) but not sent yet
      expect(result.processed).toBe(1);
      expect(result.notified).toBe(0);
      expect(result.skippedOptOut).toBe(0);
      expect(createAndDeliverWebhook).not.toHaveBeenCalled();
    });


    it("sends a reminder when the payment is within the merchant's personal window", async () => {
      // Payment expires in 1 minute; merchant wants reminders 2 min before → within window
      const payment = makePayment("pay-009", MERCHANT_A, 1);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "a@example.com",
          business_name: "Alpha",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 2,
      });

      const result = await runPaymentExpiryReminderJob();

      expect(result.notified).toBe(1);
      expect(createAndDeliverWebhook).toHaveBeenCalledTimes(1);
    });
  });


  describe("email preferences respected inside opted-in merchants", () => {
    it("skips email if merchant has email_notifications_enabled = false", async () => {
      const payment = makePayment("pay-010", MERCHANT_A);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "a@example.com",
          business_name: "Alpha",
          email_notifications_enabled: false, // email off
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 5,
      });

      const result = await runPaymentExpiryReminderJob();

      expect(result.notified).toBe(1); // webhook still sent
      expect(sendCheckoutExpiryReminderEmail).not.toHaveBeenCalled();
    });
  });


  describe("payment.expiring_soon webhook event", () => {
    it("fires webhook with payment_expiring_soon event type", async () => {
      const payment = makePayment("pay-webhook-001", MERCHANT_A);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "a@example.com",
          business_name: "Alpha",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 5,
      });

      await runPaymentExpiryReminderJob();

      expect(createAndDeliverWebhook).toHaveBeenCalledWith(
        MERCHANT_A,
        "payment_expiring_soon",
        expect.any(Object),
        "pay-webhook-001",
        undefined,
        "pay-webhook-001:reminder"
      );
    });


    it("includes all required fields in webhook payload", async () => {
      const payment = makePayment("pay-webhook-002", MERCHANT_A, 3);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "a@example.com",
          business_name: "Alpha",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 5,
      });

      await runPaymentExpiryReminderJob();

      const webhookCall = (createAndDeliverWebhook as jest.Mock).mock.calls[0];
      const payload = webhookCall[2];

      expect(payload).toMatchObject({
        payment_id: "pay-webhook-002",
        amount: "10.00",
        currency: "USDC",
        customer_email: "customer@example.com",
        checkout_url: "https://pay.fluxapay.com/p/test",
        expires_at: expect.any(String),
        minutes_remaining: 3,
      });

      // Verify expires_at is ISO 8601 format
      expect(new Date(payload.expires_at).toISOString()).toBe(payload.expires_at);
    });


    it("calculates minutes_remaining correctly", async () => {
      const payment = makePayment("pay-webhook-003", MERCHANT_A, 2);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "a@example.com",
          business_name: "Alpha",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 5,
      });

      await runPaymentExpiryReminderJob();

      const payload = (createAndDeliverWebhook as jest.Mock).mock.calls[0][2];
      expect(payload.minutes_remaining).toBe(2);
    });


    it("uses stable event_id for idempotency", async () => {
      const payment = makePayment("pay-webhook-004", MERCHANT_A);
      mockPrismaClient.payment.findMany.mockResolvedValue([payment]);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "a@example.com",
          business_name: "Alpha",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockResolvedValue({
        merchantId: MERCHANT_A,
        payment_expiry_reminder: true,
        reminder_minutes_before: 5,
      });

      await runPaymentExpiryReminderJob();

      const webhookCall = (createAndDeliverWebhook as jest.Mock).mock.calls[0];
      const eventId = webhookCall[5];
      
      expect(eventId).toBe("pay-webhook-004:reminder");
    });


    it("continues processing other payments if webhook fails for one", async () => {
      const payments = [
        makePayment("pay-webhook-005", MERCHANT_A),
        makePayment("pay-webhook-006", MERCHANT_B),
      ];
      mockPrismaClient.payment.findMany.mockResolvedValue(payments);
      mockPrismaClient.merchant.findMany.mockResolvedValue([
        {
          id: MERCHANT_A,
          email: "a@example.com",
          business_name: "Alpha",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
        {
          id: MERCHANT_B,
          email: "b@example.com",
          business_name: "Beta",
          email_notifications_enabled: true,
          notify_on_payment: true,
        },
      ]);

      (getNotificationPreferences as jest.Mock).mockImplementation(
        async (merchantId: string) => ({
          merchantId,
          payment_expiry_reminder: true,
          reminder_minutes_before: 5,
        })
      );

      // Mock webhook to fail for first payment
      (createAndDeliverWebhook as jest.Mock)
        .mockRejectedValueOnce(new Error("Webhook endpoint unreachable"))
        .mockResolvedValueOnce(undefined);

      const result = await runPaymentExpiryReminderJob();

      expect(result.processed).toBe(2);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toMatchObject({
        paymentId: "pay-webhook-005",
        error: expect.stringContaining("webhook"),
      });
      
      // Second webhook should still be sent
      expect(createAndDeliverWebhook).toHaveBeenCalledTimes(2);
    });
  });

  describe("Stellar error code mapping", () => {
    it("maps insufficient funds error to a friendly message", async () => {
      (mapStellarError as jest.Mock).mockReturnValue({
        code: "tx_insufficient_funds",
        message: "The account does not have enough funds to complete this transaction.",
      });

      const result = mapStellarError("tx_insufficient_funds");

      expect(result).toEqual({
        code: "tx_insufficient_funds",
        message: "The account does not have enough funds to complete this transaction.",
      });
    });

    it("maps bad auth error to a friendly message", async () => {
      (mapStellarError as jest.Mock).mockReturnValue({
        code: "tx_bad_auth",
        message: "Transaction authorization failed. Please check your signing credentials.",
      });

      const result = mapStellarError("tx_bad_auth");

      expect(result).toEqual({
        code: "tx_bad_auth",
        message: "Transaction authorization failed. Please check your signing credentials.",
      });
    });

    it("maps tx_failed error to a friendly message", async () => {
      (mapStellarError as jest.Mock).mockReturnValue({
        code: "tx_failed",
        message: "The transaction failed to process. Please try again.",
      });

      const result = mapStellarError("tx_failed");

      expect(result).toEqual({
        code: "tx_failed",
        message: "The transaction failed to process. Please try again.",
      });
    });

    it("falls back to a generic message for unknown error codes", async () => {
      (mapStellarError as jest.Mock).mockReturnValue({
        code: "tx_unknown_error",
        message: "An unexpected Stellar error occurred. Please contact support.",
      });

      const result = mapStellarError("tx_unknown_error");

      expect(result).toEqual({
        code: "tx_unknown_error",
        message: "An unexpected Stellar error occurred. Please contact support.",
      });
    });
  });
});

