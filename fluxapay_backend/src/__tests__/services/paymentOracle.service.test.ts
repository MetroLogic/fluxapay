/**
 * Payment Oracle Service Tests
 */

const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockUpdateMany = jest.fn();
const mockRedisGet = jest.fn().mockResolvedValue(null);
const mockRedisSet = jest.fn().mockResolvedValue("OK");
const mockRedisDel = jest.fn().mockResolvedValue(1);

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    Asset: jest.fn().mockImplementation((code: string, issuer: string) => ({
      code,
      issuer,
    })),
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn(),
        payments: jest.fn(),
      })),
    },
  };
});

jest.mock("../../middleware/redisIdempotency.middleware", () => ({
  redisClient: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
    del: (...args: unknown[]) => mockRedisDel(...args),
  },
}));

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    payment: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      count: mockCount,
      updateMany: mockUpdateMany,
    },
  })),
}));

jest.mock("../../utils/logger", () => ({
  getLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  })),
  getMetricsCollector: jest.fn(() => ({
    increment: jest.fn(),
    gauge: jest.fn(),
    histogram: jest.fn(),
    timer: jest.fn(),
  })),
}));
jest.mock("../../services/paymentContract.service");
jest.mock("../../services/webhook.service");
jest.mock("../../services/SorobanService", () => ({
  getSorobanHealthStatus: jest.fn(() => ({ healthy: true })),
}));

import {
  startPaymentOracle,
  stopPaymentOracle,
  getOracleMetrics,
  getOracleHealth,
  manualVerifyPayment,
  fetchPendingPaymentsPage,
} from "../../services/paymentOracle.service";

describe("PaymentOracleService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
    stopPaymentOracle();
  });

  afterEach(() => {
    stopPaymentOracle();
  });

  describe("startPaymentOracle", () => {
    it("should start the oracle service", () => {
      startPaymentOracle();
      const metrics = getOracleMetrics();
      expect(metrics).toBeDefined();
    });

    it("should not start if already running", () => {
      startPaymentOracle();
      startPaymentOracle();
      const metrics = getOracleMetrics();
      expect(metrics.pollsCompleted).toBe(0);
    });
  });

  describe("stopPaymentOracle", () => {
    it("should stop the oracle service", () => {
      startPaymentOracle();
      stopPaymentOracle();
      const health = getOracleHealth();
      expect(health).toBeDefined();
    });

    it("should handle stop when not running", () => {
      expect(() => stopPaymentOracle()).not.toThrow();
    });
  });

  describe("getOracleMetrics", () => {
    it("should return oracle metrics", () => {
      const metrics = getOracleMetrics();
      expect(metrics).toHaveProperty("pollsCompleted");
      expect(metrics).toHaveProperty("pollsFailed");
      expect(metrics).toHaveProperty("paymentsVerified");
      expect(metrics).toHaveProperty("paymentsPartial");
      expect(metrics).toHaveProperty("paymentsOverpaid");
      expect(metrics).toHaveProperty("paymentsFailed");
      expect(metrics).toHaveProperty("missedPolls");
      expect(metrics).toHaveProperty("lastPollTimestamp");
      expect(metrics).toHaveProperty("averagePollDurationMs");
    });
  });

  describe("getOracleHealth", () => {
    it("should return oracle health status", () => {
      const health = getOracleHealth();
      expect(health).toHaveProperty("isHealthy");
      expect(health).toHaveProperty("latencyMs");
      expect(health).toHaveProperty("lastSuccessfulPoll");
      expect(health).toHaveProperty("consecutiveFailures");
    });
  });

  describe("manualVerifyPayment", () => {
    it("should throw error for non-existent payment", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(manualVerifyPayment("non-existent-id")).rejects.toThrow(
        "Payment non-existent-id not found"
      );
    });
  });

  describe("fetchPendingPaymentsPage cursor pagination", () => {
    const batchSize = parseInt(process.env.ORACLE_BATCH_SIZE || "50", 10);

    it("never loads more than ORACLE_BATCH_SIZE rows per cycle", async () => {
      const page = Array.from({ length: batchSize }, (_, i) => ({
        id: `pay_${String(i).padStart(3, "0")}`,
      }));
      mockFindMany.mockResolvedValue(page);

      const result = await fetchPendingPaymentsPage(new Date());
      expect(result.length).toBeLessThanOrEqual(batchSize);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: batchSize, orderBy: { id: "asc" } }),
      );
      expect(mockRedisSet).toHaveBeenCalledWith(
        "oracle:pending_payments_cursor",
        page[page.length - 1].id,
      );
    });

    it("processes 200 pending payments across 4 cycles of 50", async () => {
      const all = Array.from({ length: 200 }, (_, i) => ({
        id: `pay_${String(i).padStart(3, "0")}`,
      }));
      let cursor: string | null = null;
      mockRedisGet.mockImplementation(async () => cursor);
      mockRedisSet.mockImplementation(async (_key: string, value: string) => {
        cursor = value;
        return "OK";
      });
      mockFindMany.mockImplementation(async ({ where, take }: any) => {
        const startId = where?.id?.gt;
        const filtered = startId
          ? all.filter((p) => p.id > startId)
          : all;
        return filtered.slice(0, take);
      });

      const seen = new Set<string>();
      for (let cycle = 0; cycle < 4; cycle++) {
        const page = await fetchPendingPaymentsPage(new Date());
        expect(page.length).toBe(50);
        expect(page.length).toBeLessThanOrEqual(batchSize);
        for (const p of page) {
          expect(seen.has(p.id)).toBe(false);
          seen.add(p.id);
        }
      }
      expect(seen.size).toBe(200);
    });
  });
});
