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
import { DepositAddressService } from "../depositAddress.service";
import { AppEvents, eventBus } from "../EventService";

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
// Functions must be defined inside the factory to avoid jest-hoisting TDZ issues
jest.mock("../../generated/client/client", () => {
  const paymentFindMany = jest.fn();
  const paymentUpdateMany = jest.fn();
  const executeRaw = jest.fn();
  return {
    PrismaClient: jest.fn(() => ({
      $executeRaw: executeRaw,
      payment: {
        findMany: paymentFindMany,
        updateMany: paymentUpdateMany,
      },
    })),
  };
});

import { PrismaClient } from "../../generated/client/client";
// Grab mock fn references from the singleton instance created when the module loaded
const MockedPrisma = PrismaClient as jest.MockedClass<typeof PrismaClient>;
const _prismaInstance = MockedPrisma.mock.results[0]!.value;
const mockExecuteRaw = _prismaInstance.$executeRaw as jest.Mock;
const mockPaymentFindMany = _prismaInstance.payment.findMany as jest.Mock;
const mockPaymentUpdateMany = _prismaInstance.payment.updateMany as jest.Mock;

// ─── Mock webhook.service ─────────────────────────────────────────────────────
const mockCreateAndDeliverWebhook = jest.fn();
jest.mock("../webhook.service", () => ({
  createAndDeliverWebhook: (...args: any[]) => mockCreateAndDeliverWebhook(...args),
}));

// ─── Mock EventService ────────────────────────────────────────────────────────
jest.mock("../EventService", () => {
  const listeners = new Map<string, ((payload: any) => unknown)[]>();
  return {
    eventBus: {
      on: jest.fn((event: string, listener: (payload: any) => unknown) => {
        const eventListeners = listeners.get(event) ?? [];
        eventListeners.push(listener);
        listeners.set(event, eventListeners);
      }),
      emit: jest.fn((event: string, payload: any) => {
        for (const listener of listeners.get(event) ?? []) {
          listener(payload);
        }
        return true;
      }),
    },
    AppEvents: {
      PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
      PAYMENT_EXPIRED: "PAYMENT_EXPIRED",
    },
  };
});

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
  mockExecuteRaw
    .mockResolvedValueOnce(owned ? 1 : 0)
    .mockResolvedValue(undefined);
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

  it("does not expire a payment confirmed between selection and update", async () => {
    let currentStatus = "pending";
    setupLock();
    mockPaymentFindMany.mockImplementation(async () => {
      currentStatus = "confirmed";
      return [PENDING_PAYMENT];
    });
    mockPaymentUpdateMany.mockImplementation(async ({ where, data }) => {
      if (!where.status.in.includes(currentStatus)) {
        return { count: 0 };
      }
      currentStatus = data.status;
      return { count: 1 };
    });

    const result = await runPaymentExpiryJob();

    expect(result.expired).toBe(0);
    expect(currentStatus).toBe("confirmed");
    expect(mockCreateAndDeliverWebhook).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalledWith(
      AppEvents.PAYMENT_EXPIRED,
      expect.anything(),
    );
  });

  it("expires a partially paid payment when its session window ends", async () => {
    setupLock();
    mockPaymentFindMany.mockResolvedValue([{
      ...PENDING_PAYMENT,
      id: "pay_partial_expiry",
    }]);
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockCreateAndDeliverWebhook.mockResolvedValue({ id: "wh_log_partial_expiry" });

    const result = await runPaymentExpiryJob();

    expect(result.expired).toBe(1);
    expect(mockPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["pending", "partially_paid"] },
        }),
      }),
    );
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "pay_partial_expiry",
          status: { in: ["pending", "partially_paid"] },
        },
      }),
    );
  });

  it("processes batches of 100+ payments and emits an expiry event for each", async () => {
    const payments = Array.from({ length: 105 }, (_, index) => ({
      ...PENDING_PAYMENT,
      id: `pay_expiry_${index + 1}`,
    }));

    setupLock();
    mockPaymentFindMany.mockResolvedValue(payments);
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockCreateAndDeliverWebhook.mockResolvedValue({ id: "wh_log_batch" });

    const result = await runPaymentExpiryJob();

    expect(result).toMatchObject({ processed: 105, expired: 105, webhookErrors: [] });
    expect(eventBus.emit).toHaveBeenCalledTimes(105);
    payments.forEach((payment, index) => {
      expect(eventBus.emit).toHaveBeenNthCalledWith(index + 1, AppEvents.PAYMENT_EXPIRED, {
        ...payment,
        status: "expired",
      });
    });
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

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw.mock.calls[0][0].join("?")).toContain(
      'WHERE "CronLock".expires_at < ?',
    );
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

  it("releases the deposit address when an expired payment event is emitted", async () => {
    const releaseAddress = jest
      .spyOn(DepositAddressService, "releaseAddress")
      .mockResolvedValue();
    DepositAddressService.initializeListeners();

    setupLock();
    mockPaymentFindMany.mockResolvedValue([PENDING_PAYMENT]);
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockCreateAndDeliverWebhook.mockResolvedValue({ id: "wh_log_001" });

    await runPaymentExpiryJob();

    expect(eventBus.emit).toHaveBeenCalledWith(
      AppEvents.PAYMENT_EXPIRED,
      expect.objectContaining({
        id: PENDING_PAYMENT.id,
        status: "expired",
      }),
    );
    expect(releaseAddress).toHaveBeenCalledWith(PENDING_PAYMENT.id);
  });

  it("releases the distributed lock even when an unhandled exception occurs mid-job (#1071)", async () => {
    setupLock();
    // Simulate an unexpected failure partway through the job — e.g. a DB
    // error while fetching expired payments.
    mockPaymentFindMany.mockRejectedValue(new Error("DB connection lost"));

    await expect(runPaymentExpiryJob()).rejects.toThrow("DB connection lost");

    // The lock must still be released (via the `finally` block) so the job
    // isn't stuck until the lock's TTL expires.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    expect(mockExecuteRaw.mock.calls[1][0].join("?")).toContain("DELETE FROM \"CronLock\"");
    expect(mockExecuteRaw.mock.calls[1][2]).toBe(`${process.env.HOSTNAME ?? "app"}:${process.pid}`);
  });
});
