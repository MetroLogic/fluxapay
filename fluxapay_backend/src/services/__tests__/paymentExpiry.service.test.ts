/**
 * paymentExpiry.service.test.ts
 *
 * Unit tests for issue #655:
 *  - On payment expiry, webhook.service emits a payment.expired event
 *  - Webhook payload: charge_id, merchant_id, amount, currency, expired_at
 *  - payment_expired enum value used (not payment_failed)
 *  - Idempotent delivery attempt is recorded in webhookLog (webhook_deliveries)
 */

import { runPaymentExpiryJob } from "../paymentExpiry.service";

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
// Functions must be defined inside the factory to avoid jest-hoisting TDZ issues
jest.mock("../../generated/client/client", () => {
  const paymentFindMany = jest.fn();
  const paymentUpdateMany = jest.fn();
  const cronLockUpsert = jest.fn();
  const cronLockFindUnique = jest.fn();
  const cronLockDelete = jest.fn();
  return {
    PrismaClient: jest.fn(() => ({
      payment: {
        findMany: paymentFindMany,
        updateMany: paymentUpdateMany,
      },
      cronLock: {
        upsert: cronLockUpsert,
        findUnique: cronLockFindUnique,
        delete: cronLockDelete,
      },
    })),
  };
});

import { PrismaClient } from "../../generated/client/client";
// Grab mock fn references from the singleton instance created when the module loaded
const MockedPrisma = PrismaClient as jest.MockedClass<typeof PrismaClient>;
const _prismaInstance = MockedPrisma.mock.results[0]!.value;
const mockPaymentFindMany = _prismaInstance.payment.findMany as jest.Mock;
const mockPaymentUpdateMany = _prismaInstance.payment.updateMany as jest.Mock;
const mockCronLockUpsert = _prismaInstance.cronLock.upsert as jest.Mock;
const mockCronLockFindUnique = _prismaInstance.cronLock.findUnique as jest.Mock;
const mockCronLockDelete = _prismaInstance.cronLock.delete as jest.Mock;

// ─── Mock webhook.service ─────────────────────────────────────────────────────
const mockCreateAndDeliverWebhook = jest.fn();
jest.mock("../webhook.service", () => ({
  createAndDeliverWebhook: (...args: any[]) => mockCreateAndDeliverWebhook(...args),
}));

// ─── Mock EventService ────────────────────────────────────────────────────────
jest.mock("../EventService", () => ({
  eventBus: { emit: jest.fn() },
  AppEvents: { PAYMENT_EXPIRED: "PAYMENT_EXPIRED" },
}));

// ─── Mock metrics middleware ───────────────────────────────────────────────────
jest.mock("../../middleware/metrics.middleware", () => ({
  trackPaymentExpired: jest.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────

const PENDING_PAYMENT = {
  id: "pay_expiry_001",
  merchantId: "merchant_abc",
  amount: { toString: () => "50.00" },
  currency: "USDC",
  customer_email: "buyer@example.com",
  expiration: new Date(Date.now() - 60_000), // 1 minute in the past
};

function setupLock(owned = true) {
  mockCronLockUpsert.mockResolvedValue({});
  mockCronLockFindUnique.mockResolvedValue(
    owned
      ? {
          locked_by: `${process.env.HOSTNAME ?? "app"}:${process.pid}`,
          expires_at: new Date(Date.now() + 300_000),
        }
      : { locked_by: "other-instance:9999", expires_at: new Date(Date.now() + 300_000) }
  );
  mockCronLockDelete.mockResolvedValue({});
}

describe("runPaymentExpiryJob — webhook emission (issue #655)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("emits payment_expired webhook with correct payload on expiry", async () => {
    setupLock();
    mockPaymentFindMany.mockResolvedValue([PENDING_PAYMENT]);
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockCreateAndDeliverWebhook.mockResolvedValue({ id: "wh_log_001" });

    const result = await runPaymentExpiryJob();

    expect(result.expired).toBe(1);
    expect(mockCreateAndDeliverWebhook).toHaveBeenCalledTimes(1);

    // ── Verify event type is payment_expired, NOT payment_failed ──
    const [merchantId, eventType, payload, paymentId, , eventId] =
      mockCreateAndDeliverWebhook.mock.calls[0];

    expect(merchantId).toBe("merchant_abc");
    expect(eventType).toBe("payment_expired");

    // ── Verify outer envelope ──
    expect(payload.event).toBe("payment.expired");

    // ── Verify required payload fields (spec: charge_id, merchant_id, amount, currency, expired_at) ──
    expect(payload.data.charge_id).toBe("pay_expiry_001");
    expect(payload.data.merchant_id).toBe("merchant_abc");
    expect(payload.data.amount).toBe("50.00");
    expect(payload.data.currency).toBe("USDC");
    expect(payload.data.expired_at).toBeDefined();
    expect(new Date(payload.data.expired_at).toString()).not.toBe("Invalid Date");

    // ── Verify paymentId passed for delivery record ──
    expect(paymentId).toBe("pay_expiry_001");

    // ── Stable event_id for idempotency ──
    expect(eventId).toBe("pay_expiry_001:expired");
  });

  it("records a delivery attempt in webhookLog (integration guard)", async () => {
    setupLock();
    mockPaymentFindMany.mockResolvedValue([PENDING_PAYMENT]);
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    // Simulate that createAndDeliverWebhook internally creates a webhookLog row
    mockCreateAndDeliverWebhook.mockResolvedValue({ id: "wh_log_delivery" });

    await runPaymentExpiryJob();

    // The webhook service was called — its internals create the webhook_deliveries row
    expect(mockCreateAndDeliverWebhook).toHaveBeenCalledWith(
      "merchant_abc",
      "payment_expired",
      expect.objectContaining({
        event: "payment.expired",
        data: expect.objectContaining({
          charge_id: "pay_expiry_001",
          merchant_id: "merchant_abc",
        }),
      }),
      "pay_expiry_001",
      undefined,
      "pay_expiry_001:expired"
    );
  });

  it("does not emit webhook when payment was already transitioned (idempotency guard)", async () => {
    setupLock();
    mockPaymentFindMany.mockResolvedValue([PENDING_PAYMENT]);
    // Simulate concurrent update already handled the row
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });

    const result = await runPaymentExpiryJob();

    expect(result.expired).toBe(0);
    expect(mockCreateAndDeliverWebhook).not.toHaveBeenCalled();
  });

  it("tracks webhook errors and continues processing remaining payments", async () => {
    const payment2 = { ...PENDING_PAYMENT, id: "pay_expiry_002", merchantId: "merchant_xyz" };

    setupLock();
    mockPaymentFindMany.mockResolvedValue([PENDING_PAYMENT, payment2]);
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });

    // First payment webhook fails, second succeeds
    mockCreateAndDeliverWebhook
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce({ id: "wh_log_002" });

    const result = await runPaymentExpiryJob();

    expect(result.expired).toBe(2);
    expect(result.webhookErrors).toHaveLength(1);
    expect(result.webhookErrors[0].paymentId).toBe("pay_expiry_001");
    expect(result.webhookErrors[0].error).toBe("Network timeout");
  });

  it("returns early without processing if lock is not acquired", async () => {
    setupLock(false);

    const result = await runPaymentExpiryJob();

    expect(result.processed).toBe(0);
    expect(result.expired).toBe(0);
    expect(mockPaymentFindMany).not.toHaveBeenCalled();
    expect(mockCreateAndDeliverWebhook).not.toHaveBeenCalled();
  });

  it("returns early and does not fire webhooks when no payments are expired", async () => {
    setupLock();
    mockPaymentFindMany.mockResolvedValue([]);

    const result = await runPaymentExpiryJob();

    expect(result.processed).toBe(0);
    expect(result.expired).toBe(0);
    expect(mockCreateAndDeliverWebhook).not.toHaveBeenCalled();
  });
});
