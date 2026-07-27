/**
 * Unit tests for plan.service.ts's price-change handling (issue #828).
 *
 * Validates that:
 *  1. processBillingCycle() renews at the plan's *current* amount, not a
 *     stale value, when the admin has changed the plan's price.
 *  2. createSubscription() seeds current_period_amount from the plan at
 *     creation time.
 *  3. sendUpcomingSubscriptionPriceChangeNotices() emails a merchant when
 *     their upcoming renewal price increased, and skips when it didn't (or
 *     a notice was already sent).
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockPrismaClient = {
  cronLock: {
    upsert: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  },
  plan: {
    findUnique: jest.fn(),
  },
  merchantSubscription: {
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
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
  sendSubscriptionPriceChangeNoticeEmail: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  createSubscription,
  processBillingCycle,
  sendUpcomingSubscriptionPriceChangeNotices,
} from "../../services/plan.service";
import { sendSubscriptionPriceChangeNoticeEmail } from "../../services/email.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal Decimal-like stub matching how Prisma's Decimal is used in plan.service.ts. */
function decimal(value: number) {
  return {
    value,
    toString: () => String(value),
    lte(other: { value: number }) {
      return value <= other.value;
    },
  };
}

const NOW = new Date("2026-07-27T10:00:00.000Z");

function mockLockAcquired(jobName: string) {
  const lockedBy = `${process.env.HOSTNAME ?? "app"}:${process.pid}`;
  mockPrismaClient.cronLock.findUnique.mockResolvedValue({
    job_name: jobName,
    locked_by: lockedBy,
    expires_at: new Date(NOW.getTime() + 5 * 60 * 1000),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createSubscription", () => {
  it("seeds current_period_amount from the plan's amount", async () => {
    mockPrismaClient.plan.findUnique.mockResolvedValue({
      id: "plan-1",
      interval: "monthly",
      amount: decimal(10),
    });
    mockPrismaClient.merchantSubscription.create.mockResolvedValue({
      id: "sub-1",
      merchant: { webhook_url: null },
    });

    await createSubscription({ merchantId: "merchant-1", planId: "plan-1" });

    const createArgs = mockPrismaClient.merchantSubscription.create.mock.calls[0][0];
    expect(createArgs.data.current_period_amount.value).toBe(10);
  });
});

describe("processBillingCycle", () => {
  it("renews at the plan's current price, not a stale stored amount", async () => {
    const dueSubscription = {
      id: "sub-1",
      merchantId: "merchant-1",
      planId: "plan-1",
      plan: { slug: "pro" },
      next_billing_date: NOW,
      billing_cycle: "monthly",
    };

    mockPrismaClient.merchantSubscription.findMany.mockResolvedValue([dueSubscription]);
    mockPrismaClient.merchantSubscription.findUnique.mockResolvedValue({
      id: "sub-1",
      merchantId: "merchant-1",
      planId: "plan-1",
      status: "active",
      next_billing_date: NOW,
      billing_cycle: "monthly",
      current_period_amount: decimal(10), // stale amount from before the price change
      merchant: { webhook_url: null },
      // The plan's price was changed by an admin from 10 to 15.
      plan: { slug: "pro", amount: decimal(15) },
    });

    const result = await processBillingCycle();

    expect(result.renewed).toBe(1);
    const updateArgs = mockPrismaClient.merchantSubscription.update.mock.calls[0][0];
    expect(updateArgs.data.current_period_amount.value).toBe(15);
    // The next price-change window should be re-armed for the following cycle.
    expect(updateArgs.data.price_change_notice_sent_at).toBeNull();
  });

  it("skips subscriptions that are no longer active", async () => {
    mockPrismaClient.merchantSubscription.findMany.mockResolvedValue([
      { id: "sub-1", merchantId: "m1", planId: "p1", plan: { slug: "pro" }, next_billing_date: NOW, billing_cycle: "monthly" },
    ]);
    mockPrismaClient.merchantSubscription.findUnique.mockResolvedValue({
      id: "sub-1",
      status: "canceled",
    });

    const result = await processBillingCycle();

    expect(result.renewed).toBe(0);
    expect(mockPrismaClient.merchantSubscription.update).not.toHaveBeenCalled();
  });
});

describe("sendUpcomingSubscriptionPriceChangeNotices", () => {
  beforeEach(() => mockLockAcquired("subscription_price_change_notice"));

  it("emails the merchant when the upcoming renewal price increased", async () => {
    mockPrismaClient.merchantSubscription.findMany.mockResolvedValue([
      {
        id: "sub-1",
        current_period_amount: decimal(10),
        next_billing_date: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
        merchant: {
          email: "merchant@example.com",
          business_name: "Acme",
          email_notifications_enabled: true,
        },
        plan: { name: "Pro", amount: decimal(15), currency: "USDC" },
      },
    ]);

    const result = await sendUpcomingSubscriptionPriceChangeNotices();

    expect(result.notified).toBe(1);
    expect(sendSubscriptionPriceChangeNoticeEmail).toHaveBeenCalledWith(
      "merchant@example.com",
      "Acme",
      expect.objectContaining({
        subscription_id: "sub-1",
        old_amount: "10",
        new_amount: "15",
      }),
    );
    expect(mockPrismaClient.merchantSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { price_change_notice_sent_at: NOW },
    });
  });

  it("does not email when the price did not increase", async () => {
    mockPrismaClient.merchantSubscription.findMany.mockResolvedValue([
      {
        id: "sub-2",
        current_period_amount: decimal(15),
        next_billing_date: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
        merchant: {
          email: "merchant2@example.com",
          business_name: "Beta",
          email_notifications_enabled: true,
        },
        plan: { name: "Pro", amount: decimal(15), currency: "USDC" },
      },
    ]);

    const result = await sendUpcomingSubscriptionPriceChangeNotices();

    expect(result.notified).toBe(0);
    expect(sendSubscriptionPriceChangeNoticeEmail).not.toHaveBeenCalled();
    expect(mockPrismaClient.merchantSubscription.update).not.toHaveBeenCalled();
  });

  it("does not email a merchant who has disabled email notifications", async () => {
    mockPrismaClient.merchantSubscription.findMany.mockResolvedValue([
      {
        id: "sub-3",
        current_period_amount: decimal(10),
        next_billing_date: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
        merchant: {
          email: "merchant3@example.com",
          business_name: "Gamma",
          email_notifications_enabled: false,
        },
        plan: { name: "Pro", amount: decimal(20), currency: "USDC" },
      },
    ]);

    const result = await sendUpcomingSubscriptionPriceChangeNotices();

    expect(sendSubscriptionPriceChangeNoticeEmail).not.toHaveBeenCalled();
    // Still marked as processed so it isn't picked up again every tick.
    expect(mockPrismaClient.merchantSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub-3" },
      data: { price_change_notice_sent_at: NOW },
    });
    expect(result.notified).toBe(1);
  });
});
