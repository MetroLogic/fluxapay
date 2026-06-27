/**
 * exchange.service.test.ts
 *
 * Tests for exchange partner integrations (Mock, YellowCard, Anchor)
 */

import {
  MockExchangePartner,
  YellowCardPartner,
  AnchorPartner,
  getExchangePartner,
  resetExchangePartnerForTests,
  BankAccountDetails,
  getCachedFxRate,
  getStaleFxRate,
  getAllCachedFxRates,
} from "../exchange.service";
import { redisClient } from "../../middleware/redisIdempotency.middleware";

// Mock fetch globally
global.fetch = jest.fn();

describe("exchange.service", () => {
  const mockBankAccount: BankAccountDetails = {
    account_name: "Test Account",
    account_number: "1234567890",
    bank_name: "Test Bank",
    bank_code: "123",
    currency: "NGN",
    country: "NG",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe("MockExchangePartner", () => {
    let partner: MockExchangePartner;

    beforeEach(() => {
      partner = new MockExchangePartner();
    });

    it("should return quote for NGN", async () => {
      const quote = await partner.getQuote(100, "NGN");

      expect(quote.fiat_gross).toBe(155000); // 100 * 1550
      expect(quote.exchange_rate).toBe(1550);
      expect(quote.fiat_currency).toBe("NGN");
      expect(quote.quote_ref).toContain("mock_quote_");
    });

    it("should return quote for KES", async () => {
      const quote = await partner.getQuote(100, "KES");

      expect(quote.fiat_gross).toBe(13000); // 100 * 130
      expect(quote.exchange_rate).toBe(130);
      expect(quote.fiat_currency).toBe("KES");
    });

    it("should execute payout successfully", async () => {
      const result = await partner.convertAndPayout(
        100,
        "NGN",
        mockBankAccount,
        "ref_123"
      );

      expect(result.transfer_ref).toContain("mock_transfer_");
      expect(result.exchange_ref).toContain("mock_exchange_");
      expect(result.initiated_at).toBeDefined();
      expect(result.raw_partner_payload).toBeDefined();
      expect(result.raw_partner_payload.partner).toBe("mock");
    });

    it("should default to rate 1 for unknown currency", async () => {
      const quote = await partner.getQuote(100, "XXX");

      expect(quote.fiat_gross).toBe(100);
      expect(quote.exchange_rate).toBe(1);
    });
  });

  describe("YellowCardPartner", () => {
    let partner: YellowCardPartner;

    beforeEach(() => {
      process.env.YELLOWCARD_API_KEY = "test_key";
      process.env.YELLOWCARD_API_URL = "https://api.yellowcard.io";
      partner = new YellowCardPartner();
    });

    it("should fetch quote from YellowCard API", async () => {
      const mockResponse = {
        rate: 1550,
        destinationAmount: 155000,
        quoteId: "yc_quote_123",
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const quote = await partner.getQuote(100, "NGN");

      expect(quote.fiat_gross).toBe(155000);
      expect(quote.exchange_rate).toBe(1550);
      expect(quote.fiat_currency).toBe("NGN");
      expect(quote.quote_ref).toBe("yc_quote_123");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v2/rates"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test_key",
          }),
        })
      );
    });

    it("should execute payout via YellowCard API", async () => {
      const mockQuoteResponse = {
        rate: 1550,
        destinationAmount: 155000,
        quoteId: "yc_quote_123",
      };

      const mockPayoutResponse = {
        transferId: "yc_transfer_123",
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockQuoteResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPayoutResponse,
        });

      const result = await partner.convertAndPayout(
        100,
        "NGN",
        mockBankAccount,
        "ref_123"
      );

      expect(result.transfer_ref).toBe("yc_transfer_123");
      expect(result.exchange_ref).toBe("yc_quote_123");
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should throw error on API failure", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      });

      await expect(partner.getQuote(100, "NGN")).rejects.toThrow(
        "YellowCard API error"
      );
    });
  });

  describe("AnchorPartner", () => {
    let partner: AnchorPartner;

    beforeEach(() => {
      process.env.ANCHOR_API_KEY = "test_key";
      process.env.ANCHOR_API_URL = "https://api.anchorusd.com";
      partner = new AnchorPartner();
    });

    it("should fetch quote from Anchor API", async () => {
      const mockResponse = {
        rate: 1550,
        fiat_amount: 155000,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const quote = await partner.getQuote(100, "NGN");

      expect(quote.fiat_gross).toBe(155000);
      expect(quote.exchange_rate).toBe(1550);
      expect(quote.fiat_currency).toBe("NGN");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/quote"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Api-Key": "test_key",
          }),
        })
      );
    });

    it("should execute payout via Anchor API", async () => {
      const mockResponse = {
        reference: "anchor_ref_123",
        exchange_id: "anchor_exchange_123",
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await partner.convertAndPayout(
        100,
        "NGN",
        mockBankAccount,
        "ref_123"
      );

      expect(result.transfer_ref).toBe("anchor_ref_123");
      expect(result.exchange_ref).toBe("anchor_exchange_123");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/offramp/payout"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("ref_123"),
        })
      );
    });

    it("should throw error on API failure", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      });

      await expect(partner.getQuote(100, "NGN")).rejects.toThrow(
        "Anchor API error"
      );
    });
  });

  describe("getExchangePartner", () => {
    afterEach(() => {
      resetExchangePartnerForTests();
      delete process.env.EXCHANGE_PARTNER;
    });

    it("should return MockExchangePartner by default", () => {
      delete process.env.EXCHANGE_PARTNER;
      resetExchangePartnerForTests();
      const partner = getExchangePartner();
      expect(partner).toBeInstanceOf(MockExchangePartner);
    });

    it("should return YellowCardPartner when configured", () => {
      process.env.EXCHANGE_PARTNER = "yellowcard";
      process.env.YELLOWCARD_API_KEY = "test_key";
      resetExchangePartnerForTests();
      const partner = getExchangePartner();
      expect(partner).toBeInstanceOf(YellowCardPartner);
    });

    it("should return AnchorPartner when configured", () => {
      process.env.EXCHANGE_PARTNER = "anchor";
      process.env.ANCHOR_API_KEY = "test_key";
      resetExchangePartnerForTests();
      const partner = getExchangePartner();
      expect(partner).toBeInstanceOf(AnchorPartner);
    });

    it("should return same instance on subsequent calls", () => {
      resetExchangePartnerForTests();
      const partner1 = getExchangePartner();
      const partner2 = getExchangePartner();
      expect(partner1).toBe(partner2);
    });
  });

  describe("FX Rate Caching", () => {
    afterEach(async () => {
      // Clean up Redis cache
      const keys = await redisClient.keys("fx_rate:*");
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    });

    it("should cache FX rate after successful fetch", async () => {
      const mockResponse = {
        rate: 1550,
        destinationAmount: 155000,
        quoteId: "yc_quote_123",
      };

      process.env.YELLOWCARD_API_KEY = "test_key";
      process.env.YELLOWCARD_API_URL = "https://api.yellowcard.io";
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const partner = new YellowCardPartner();
      const quote = await partner.getQuote(100, "NGN");

      // Verify cache was set
      const cached = await getCachedFxRate("USDC", "NGN");
      expect(cached).not.toBeNull();
      expect(cached?.exchange_rate).toBe(1550);
      expect(cached?.fiat_currency).toBe("NGN");
    });

    it("should return cached rate on subsequent requests", async () => {
      const mockResponse = {
        rate: 1550,
        destinationAmount: 155000,
        quoteId: "yc_quote_123",
      };

      process.env.YELLOWCARD_API_KEY = "test_key";
      process.env.YELLOWCARD_API_URL = "https://api.yellowcard.io";
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const partner = new YellowCardPartner();

      // First call fetches from API
      const quote1 = await partner.getQuote(100, "NGN");
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache (no fetch call)
      (global.fetch as jest.Mock).mockClear();
      const quote2 = await partner.getQuote(100, "NGN");
      expect(global.fetch).not.toHaveBeenCalled();
      expect(quote2.exchange_rate).toBe(1550);
    });

    it("should use stale rate when API fails", async () => {
      process.env.YELLOWCARD_API_KEY = "test_key";
      process.env.YELLOWCARD_API_URL = "https://api.yellowcard.io";

      // First, cache a rate
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rate: 1550,
          destinationAmount: 155000,
          quoteId: "yc_quote_123",
        }),
      });

      const partner = new YellowCardPartner();
      await partner.getQuote(100, "NGN");

      // Clear cache but keep stale data
      await redisClient.del("fx_rate:USDC:NGN");

      // Now API fails
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server error",
      });

      // Should fall back to stale rate
      const quote = await partner.getQuote(100, "NGN");
      expect(quote.exchange_rate).toBe(1550);
    });

    it("should retrieve all cached FX rates", async () => {
      process.env.YELLOWCARD_API_KEY = "test_key";
      process.env.YELLOWCARD_API_URL = "https://api.yellowcard.io";

      const mockResponses = [
        { rate: 1550, destinationAmount: 155000, quoteId: "yc_quote_ngn" },
        { rate: 130, destinationAmount: 13000, quoteId: "yc_quote_kes" },
      ];

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponses[0],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponses[1],
        });

      const partner = new YellowCardPartner();
      await partner.getQuote(100, "NGN");
      await partner.getQuote(100, "KES");

      const allRates = await getAllCachedFxRates();
      expect(Object.keys(allRates).length).toBe(2);
      expect(allRates.NGN.exchange_rate).toBe(1550);
      expect(allRates.KES.exchange_rate).toBe(130);
    });

    it("should handle cache miss gracefully", async () => {
      const cached = await getCachedFxRate("USDC", "XYZ");
      expect(cached).toBeNull();
    });
  });
});
