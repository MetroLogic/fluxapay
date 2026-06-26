jest.mock("../../generated/client/client", () => {
  const mockPrismaClient = {
    cronLock: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    merchant: {
      findUnique: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

jest.mock("../webhook.service", () => ({
  createAndDeliverWebhook: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../email.service", () => ({
  sendCheckoutExpiryReminderEmail: jest.fn().mockResolvedValue(undefined),
}));

import { PrismaClient } from "../../generated/client/client";
import { runPaymentExpiryReminderJob } from "../paymentExpiryReminder.service";
import { createAndDeliverWebhook } from "../webhook.service";
import { sendCheckoutExpiryReminderEmail } from "../email.service";

const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient> & {
  cronLock: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    delete: jest.Mock;
  };
  payment: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  merchant: {
    findUnique: jest.Mock;
  };
};

describe("paymentExpiryReminder.service", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...savedEnv,
      CHECKOUT_REMINDER_ENABLED: "true",
      CHECKOUT_REMINDER_MINUTES: "5",
      CHECKOUT_REMINDER_SEND_WEBHOOK: "true",
      CHECKOUT_REMINDER_SEND_EMAIL: "true",
    };

    mockPrisma.cronLock.upsert.mockResolvedValue({});
    mockPrisma.cronLock.findUnique.mockResolvedValue({
      job_name: "payment_expiry_reminder",
      locked_by: `${process.env.HOSTNAME ?? "app"}:${process.pid}`,
      expires_at: new Date(Date.now() + 60_000),
    });
    mockPrisma.cronLock.delete.mockResolvedValue({});
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  it("returns empty result when reminders are disabled", async () => {
    process.env.CHECKOUT_REMINDER_ENABLED = "false";

    const result = await runPaymentExpiryReminderJob();

    expect(result).toEqual({ processed: 0, notified: 0, errors: [] });
    expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();
  });

  it("notifies merchants for payments expiring within the reminder window", async () => {
    const expiringPayment = {
      id: "pay_exp_1",
      merchantId: "merchant_1",
      amount: 100,
      currency: "USDC",
      customer_email: "buyer@example.com",
      checkout_url: "https://pay.example.com/pay_exp_1",
      expiration: new Date(Date.now() + 3 * 60_000),
    };

    mockPrisma.payment.findMany.mockResolvedValue([expiringPayment]);
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.merchant.findUnique.mockResolvedValue({
      email: "merchant@example.com",
      business_name: "Test Merchant",
      email_notifications_enabled: true,
      notify_on_payment: true,
    });

    const result = await runPaymentExpiryReminderJob();

    expect(result.processed).toBe(1);
    expect(result.notified).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(createAndDeliverWebhook).toHaveBeenCalledWith(
      "merchant_1",
      "payment_pending",
      expect.objectContaining({
        event: "payment.expiring_soon",
        data: expect.objectContaining({ payment_id: "pay_exp_1" }),
      }),
      "pay_exp_1",
      undefined,
      "pay_exp_1:reminder",
    );
    expect(sendCheckoutExpiryReminderEmail).toHaveBeenCalled();
  });

  it("skips work when cron lock is held by another instance", async () => {
    mockPrisma.cronLock.findUnique.mockResolvedValue({
      job_name: "payment_expiry_reminder",
      locked_by: "other-instance",
      expires_at: new Date(Date.now() + 60_000),
    });

    const result = await runPaymentExpiryReminderJob();

    expect(result).toEqual({ processed: 0, notified: 0, errors: [] });
    expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();
  });
});
