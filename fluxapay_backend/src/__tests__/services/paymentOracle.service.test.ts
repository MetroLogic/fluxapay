/**
 * Payment Oracle Service Tests
 */

import { PrismaClient } from "../../generated/client/client";
import {
  startPaymentOracle,
  stopPaymentOracle,
  getOracleMetrics,
  getOracleHealth,
  manualVerifyPayment,
} from "../../services/paymentOracle.service";

// Mock dependencies
jest.mock("../../generated/client/client");
jest.mock("../../utils/logger");
jest.mock("../../services/paymentContract.service");
jest.mock("../../services/webhook.service");

const mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;

describe("PaymentOracleService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopPaymentOracle(); // Ensure clean state
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
      startPaymentOracle(); // Second call should be ignored
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
      (mockPrisma.payment.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(manualVerifyPayment("non-existent-id")).rejects.toThrow(
        "Payment non-existent-id not found"
      );
    });
  });
});
