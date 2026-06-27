/**
 * Usage service unit tests
 */

const merchantUsagePeriod = {
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn(),
};

const merchantSubscription = {
  findFirst: jest.fn(),
};

const merchant = {
  findUnique: jest.fn(),
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    merchantUsagePeriod,
    merchantSubscription,
    merchant,
  })),
}));

jest.mock("../webhook.service", () => ({
  createAndDeliverWebhook: jest.fn().mockResolvedValue(undefined),
}));

import {
  getMerchantUsage,
  incrementUsage,
  checkUsageLimit,
  enforceUsageLimitError,
} from "../usage.service";

describe("usage.service", () => {
  beforeEach(() => jest.clearAllMocks());

  const periodStart = new Date("2026-06-01T00:00:00Z");
  const periodEnd = new Date("2026-07-01T00:00:00Z");

  beforeEach(() => {
    merchantSubscription.findFirst.mockResolvedValue({
      merchantId: "m1",
      current_period_start: periodStart,
      current_period_end: periodEnd,
      plan: {
        slug: "starter",
        name: "Starter",
        api_call_limit: 100,
        charge_limit: 50,
        settlement_volume_limit: 1000,
        overage_mode: "hard_block",
        features: [],
      },
    });
    merchantUsagePeriod.findUnique.mockResolvedValue({
      id: "u1",
      merchantId: "m1",
      period_start: periodStart,
      period_end: periodEnd,
      api_calls: 80,
      charges_created: 10,
      settlement_volume: 100,
      warning_80_sent_at: null,
    });
    merchant.findUnique.mockResolvedValue({
      id: "m1",
      email: "test@example.com",
      webhook_url: null,
      email_notifications_enabled: true,
    });
  });

  it("returns usage vs plan limits", async () => {
    const usage = await getMerchantUsage("m1");
    expect(usage.metrics.api_calls.used).toBe(80);
    expect(usage.metrics.api_calls.limit).toBe(100);
    expect(usage.metrics.api_calls.percent).toBe(80);
    expect(usage.plan?.slug).toBe("starter");
  });

  it("blocks when limit exceeded in hard_block mode", async () => {
    merchantUsagePeriod.findUnique.mockResolvedValue({
      id: "u1",
      merchantId: "m1",
      period_start: periodStart,
      period_end: periodEnd,
      api_calls: 100,
      charges_created: 0,
      settlement_volume: 0,
      warning_80_sent_at: null,
    });

    const result = await checkUsageLimit("m1", "api_calls");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(0);
  });

  it("throws 429 via enforceUsageLimitError", () => {
    expect(() =>
      enforceUsageLimitError({
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        plan: null,
        overage_mode: "hard_block",
        metrics: {
          api_calls: { used: 100, limit: 100, percent: 100 },
          charges_created: { used: 0, limit: 50, percent: 0 },
          settlement_volume: { used: 0, limit: 1000, percent: 0 },
        },
      }, 3600),
    ).toThrow(expect.objectContaining({ status: 429 }));
  });

  it("increments usage counters", async () => {
    merchantUsagePeriod.update.mockResolvedValue({
      id: "u1",
      api_calls: 81,
      charges_created: 10,
      settlement_volume: 100,
      warning_80_sent_at: new Date(),
    });

    await incrementUsage("m1", "api_calls");
    expect(merchantUsagePeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { api_calls: { increment: 1 } },
      }),
    );
  });
});
