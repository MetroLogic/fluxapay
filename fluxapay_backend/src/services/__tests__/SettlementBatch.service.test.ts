/**
 * settlementBatch.service.test.ts
 *
 * Comprehensive tests for the settlement batch service
 */

import { runSettlementBatch, isMerchantDueForSettlement } from "../settlementBatch.service";
import { PrismaClient } from "../../generated/client/client";
import { getExchangePartner } from "../exchange.service";

// Mock dependencies
const mockPrisma = {
  merchant: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  settlement: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  Prisma: {
    TransactionClient: jest.fn(),
  },
}));

jest.mock("../exchange.service");
jest.mock("../webhook.service", () => ({
  createAndDeliverWebhook: jest.fn(),
}));
jest.mock("../audit.service", () => ({
  logSettlementBatch: jest.fn().mockResolvedValue({ id: "audit_123" }),
  updateSettlementBatchCompletion: jest.fn(),
}));

describe("settlementBatch.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SETTLEMENT_FEE_PERCENT = "2";
    process.env.SETTLEMENT_BATCH_LIMIT = "500";
    process.env.EXCHANGE_PARTNER = "mock";
  });

  describe("isMerchantDueForSettlement", () => {
    it("should return true for daily schedule", () => {
      const result = isMerchantDueForSettlement("daily", null, new Date("2024-01-15"));
      expect(result).toBe(true);
    });

    it("should return true for weekly schedule on matching day", () => {
      // Monday = 1
      const monday = new Date("2024-01-15"); // This is a Monday
      const result = isMerchantDueForSettlement("weekly", 1, monday);
      expect(result).toBe(true);
    });

    it("should return false for weekly schedule on non-matching day", () => {
      // Monday = 1, but checking on Tuesday
      const tuesday = new Date("2024-01-16");
      const result = isMerchantDueForSettlement("weekly", 1, tuesday);
      expect(result).toBe(false);
    });

    it("should return false for weekly schedule with null settlement_day", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      const result = isMerchantDueForSettlement("weekly", null, new Date());
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should return false for unknown schedule", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      const result = isMerchantDueForSettlement("monthly", null, new Date());
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("runSettlementBatch", () => {
    it("should process batch with confirmed payments", async () => {
      const mockMerchants = [
        {
          id: "merchant_1",
          business_name: "Test Business",
          settlement_schedule: "daily",
          settlement_day: null,
          settlement_currency: "NGN",
          webhook_url: "https://example.com/webhook",
          bankAccount: {
            account_name: "Test Account",
            account_number: "1234567890",
            bank_name: "Test Bank",
            bank_code: "123",
            currency: "NGN",
            country: "NG",
          },
        },
      ];

      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: 100,
          swept: true,
          settled: false,
          createdAt: new Date(),
        },
        {
          id: "payment_2",
          merchantId: "merchant_1",
          amount: 50,
          swept: true,
          settled: false,
          createdAt: new Date(),
        },
      ];

      const mockExchangePartner = {
        getQuote: jest.fn().mockResolvedValue({
          fiat_gross: 232500,
          exchange_rate: 1550,
          fiat_currency: "NGN",
          quote_ref: "quote_123",
        }),
        convertAndPayout: jest.fn().mockResolvedValue({
          transfer_ref: "transfer_123",
          exchange_ref: "exchange_123",
          initiated_at: new Date().toISOString(),
          raw_partner_payload: {},
        }),
      };

      mockPrisma.merchant.findMany.mockResolvedValue(mockMerchants);
      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchants[0]);
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          settlement: {
            create: jest.fn().mockResolvedValue({
              id: "settlement_123",
              merchantId: "merchant_1",
            }),
          },
          payment: {
            updateMany: jest.fn(),
          },
        });
      });

      (getExchangePartner as jest.Mock).mockReturnValue(mockExchangePartner);

      const result = await runSettlementBatch(new Date("2024-01-15"), "admin_1");

      expect(result.totalMerchantsProcessed).toBe(1);
      expect(result.totalMerchantsSucceeded).toBe(1);
      expect(mockExchangePartner.convertAndPayout).toHaveBeenCalled();
    });

    it("should skip merchants with no bank account", async () => {
      const mockMerchants = [
        {
          id: "merchant_1",
          business_name: "Test Business",
          settlement_schedule: "daily",
          settlement_day: null,
          settlement_currency: "NGN",
          bankAccount: null,
        },
      ];

      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: 100,
          swept: true,
          settled: false,
          createdAt: new Date(),
        },
      ];

      mockPrisma.merchant.findMany.mockResolvedValue(mockMerchants);
      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchants[0]);

      const result = await runSettlementBatch(new Date("2024-01-15"), "admin_1");

      expect(result.totalMerchantsSkipped).toBe(1);
      expect(result.merchantResults[0].error).toContain("No bank account");
    });

    it("should skip merchants not due for settlement", async () => {
      const mockMerchants = [
        {
          id: "merchant_1",
          business_name: "Test Business",
          settlement_schedule: "weekly",
          settlement_day: 1, // Monday
          settlement_currency: "NGN",
          bankAccount: {
            account_name: "Test Account",
            account_number: "1234567890",
            bank_name: "Test Bank",
            currency: "NGN",
            country: "NG",
          },
        },
      ];

      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: 100,
          swept: true,
          settled: false,
          createdAt: new Date(),
        },
      ];

      mockPrisma.merchant.findMany.mockResolvedValue(mockMerchants);
      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchants[0]);

      // Run on Tuesday (day 2), but merchant is scheduled for Monday (day 1)
      const tuesday = new Date("2024-01-16");
      const result = await runSettlementBatch(tuesday, "admin_1");

      expect(result.totalMerchantsSkipped).toBe(1);
      expect(result.merchantResults[0].error).toContain("Not due today");
    });

    it("should handle exchange partner failures gracefully", async () => {
      const mockMerchants = [
        {
          id: "merchant_1",
          business_name: "Test Business",
          settlement_schedule: "daily",
          settlement_day: null,
          settlement_currency: "NGN",
          webhook_url: null,
          bankAccount: {
            account_name: "Test Account",
            account_number: "1234567890",
            bank_name: "Test Bank",
            currency: "NGN",
            country: "NG",
          },
        },
      ];

      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: 100,
          swept: true,
          settled: false,
          createdAt: new Date(),
        },
      ];

      const mockExchangePartner = {
        getQuote: jest.fn().mockRejectedValue(new Error("Exchange API unavailable")),
        convertAndPayout: jest.fn(),
      };

      mockPrisma.merchant.findMany.mockResolvedValue(mockMerchants);
      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchants[0]);
      mockPrisma.settlement.create.mockResolvedValue({
        id: "settlement_failed",
        status: "failed",
      });

      (getExchangePartner as jest.Mock).mockReturnValue(mockExchangePartner);

      const result = await runSettlementBatch(new Date("2024-01-15"), "admin_1");

      expect(result.totalMerchantsFailed).toBe(1);
      expect(result.merchantResults[0].error).toContain("Exchange API unavailable");
    });

    it("should return empty result when no unsettled payments found", async () => {
      mockPrisma.merchant.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await runSettlementBatch(new Date("2024-01-15"), "admin_1");

      expect(result.totalMerchantsProcessed).toBe(0);
      expect(result.merchantResults).toHaveLength(0);
    });

    it("should calculate fees correctly", async () => {
      process.env.SETTLEMENT_FEE_PERCENT = "2.5";

      const mockMerchants = [
        {
          id: "merchant_1",
          business_name: "Test Business",
          settlement_schedule: "daily",
          settlement_day: null,
          settlement_currency: "NGN",
          webhook_url: null,
          bankAccount: {
            account_name: "Test Account",
            account_number: "1234567890",
            bank_name: "Test Bank",
            currency: "NGN",
            country: "NG",
          },
        },
      ];

      const mockPayments = [
        {
          id: "payment_1",
          merchantId: "merchant_1",
          amount: 100,
          swept: true,
          settled: false,
          createdAt: new Date(),
        },
      ];

      const mockExchangePartner = {
        getQuote: jest.fn().mockResolvedValue({
          fiat_gross: 155000,
          exchange_rate: 1550,
          fiat_currency: "NGN",
        }),
        convertAndPayout: jest.fn().mockResolvedValue({
          transfer_ref: "transfer_123",
          exchange_ref: "exchange_123",
          initiated_at: new Date().toISOString(),
        }),
      };

      mockPrisma.merchant.findMany.mockResolvedValue(mockMerchants);
      mockPrisma.payment.findMany.mockResolvedValue(mockPayments);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchants[0]);
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          settlement: {
            create: jest.fn().mockResolvedValue({
              id: "settlement_123",
              merchantId: "merchant_1",
            }),
          },
          payment: {
            updateMany: jest.fn(),
          },
        });
      });

      (getExchangePartner as jest.Mock).mockReturnValue(mockExchangePartner);

      const result = await runSettlementBatch(new Date("2024-01-15"), "admin_1");

      expect(result.totalMerchantsSucceeded).toBe(1);
      // Fee should be 2.5% of 155000 = 3875
      // Net should be 155000 - 3875 = 151125
      expect(result.merchantResults[0].feeAmount).toBe(3875);
      expect(result.merchantResults[0].netAmount).toBe(151125);
    });
  });
});
