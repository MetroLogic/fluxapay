/**
 * webhook.retry.test.ts
 *
 * Comprehensive tests for webhook retry logic with exponential backoff
 */

import { retryWebhookService, deliverWebhook } from "../webhook.service";
import { PrismaClient } from "../../generated/client/client";

// Mock Prisma
const mockPrisma = {
  merchant: {
    findUnique: jest.fn(),
  },
  webhookLog: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  webhookRetryAttempt: {
    create: jest.fn(),
  },
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe("Webhook Retry Logic with Exponential Backoff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe("retryWebhookService - Exponential Backoff", () => {
    it("should calculate exponential backoff for retry attempts", async () => {
      const mockLog = {
        id: "log_1",
        merchantId: "merchant_1",
        endpoint_url: "https://example.com/webhook",
        request_payload: { event: "payment.confirmed" },
        status: "retrying",
        retry_count: 0,
        max_retries: 5,
      };

      const mockMerchant = {
        id: "merchant_1",
        webhook_secret: "secret_123",
      };

      mockPrisma.webhookLog.findFirst.mockResolvedValue(mockLog);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockPrisma.webhookRetryAttempt.create.mockResolvedValue({});

      // Simulate failed delivery
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const updatedLogs: any[] = [];
      mockPrisma.webhookLog.update.mockImplementation((params: any) => {
        updatedLogs.push(params.data);
        return Promise.resolve({
          ...mockLog,
          ...params.data,
        });
      });

      // Attempt 1: retry_count = 0 -> 1, backoff = 2^1 = 2 minutes
      await retryWebhookService({ merchantId: "merchant_1", log_id: "log_1" });
      expect(updatedLogs[0].retry_count).toBe(1);
      expect(updatedLogs[0].next_retry_at).toBeDefined();
      const backoff1 = updatedLogs[0].next_retry_at.getTime() - Date.now();
      expect(backoff1).toBeGreaterThanOrEqual(2 * 60 * 1000 - 1000); // ~2 minutes
      expect(backoff1).toBeLessThanOrEqual(2 * 60 * 1000 + 1000);

      // Attempt 2: retry_count = 1 -> 2, backoff = 2^2 = 4 minutes
      mockLog.retry_count = 1;
      mockPrisma.webhookLog.findFirst.mockResolvedValue(mockLog);
      updatedLogs.length = 0;

      await retryWebhookService({ merchantId: "merchant_1", log_id: "log_1" });
      expect(updatedLogs[0].retry_count).toBe(2);
      const backoff2 = updatedLogs[0].next_retry_at.getTime() - Date.now();
      expect(backoff2).toBeGreaterThanOrEqual(4 * 60 * 1000 - 1000); // ~4 minutes
      expect(backoff2).toBeLessThanOrEqual(4 * 60 * 1000 + 1000);

      // Attempt 3: retry_count = 2 -> 3, backoff = 2^3 = 8 minutes
      mockLog.retry_count = 2;
      mockPrisma.webhookLog.findFirst.mockResolvedValue(mockLog);
      updatedLogs.length = 0;

      await retryWebhookService({ merchantId: "merchant_1", log_id: "log_1" });
      expect(updatedLogs[0].retry_count).toBe(3);
      const backoff3 = updatedLogs[0].next_retry_at.getTime() - Date.now();
      expect(backoff3).toBeGreaterThanOrEqual(8 * 60 * 1000 - 1000); // ~8 minutes
      expect(backoff3).toBeLessThanOrEqual(8 * 60 * 1000 + 1000);
    });

    it("should mark webhook as failed after max retries (5 attempts)", async () => {
      const mockLog = {
        id: "log_max_retries",
        merchantId: "merchant_1",
        endpoint_url: "https://example.com/webhook",
        request_payload: { event: "payment.confirmed" },
        status: "retrying",
        retry_count: 4, // Already 4 attempts
        max_retries: 5,
      };

      const mockMerchant = {
        id: "merchant_1",
        webhook_secret: "secret_123",
      };

      mockPrisma.webhookLog.findFirst.mockResolvedValue(mockLog);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockPrisma.webhookRetryAttempt.create.mockResolvedValue({});

      // Simulate failed delivery
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
      });

      let updatedLog: any;
      mockPrisma.webhookLog.update.mockImplementation((params: any) => {
        updatedLog = { ...mockLog, ...params.data };
        return Promise.resolve(updatedLog);
      });

      await retryWebhookService({ merchantId: "merchant_1", log_id: "log_max_retries" });

      expect(updatedLog.retry_count).toBe(5);
      expect(updatedLog.status).toBe("failed");
      expect(updatedLog.next_retry_at).toBeNull();
      expect(updatedLog.failed_at).toBeDefined();
      expect(updatedLog.failure_reason).toBeDefined();
    });

    it("should stop retrying and mark as delivered on success", async () => {
      const mockLog = {
        id: "log_success",
        merchantId: "merchant_1",
        endpoint_url: "https://example.com/webhook",
        request_payload: { event: "payment.confirmed" },
        status: "retrying",
        retry_count: 2,
        max_retries: 5,
      };

      const mockMerchant = {
        id: "merchant_1",
        webhook_secret: "secret_123",
      };

      mockPrisma.webhookLog.findFirst.mockResolvedValue(mockLog);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockPrisma.webhookRetryAttempt.create.mockResolvedValue({});

      // Simulate successful delivery
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      let updatedLog: any;
      mockPrisma.webhookLog.update.mockImplementation((params: any) => {
        updatedLog = { ...mockLog, ...params.data };
        return Promise.resolve(updatedLog);
      });

      await retryWebhookService({ merchantId: "merchant_1", log_id: "log_success" });

      expect(updatedLog.status).toBe("delivered");
      expect(updatedLog.retry_count).toBe(3);
      expect(updatedLog.next_retry_at).toBeNull();
      expect(updatedLog.http_status).toBe(200);
    });
  });

  describe("Retry Attempt Logging", () => {
    it("should create a retry attempt record for each delivery attempt", async () => {
      const mockLog = {
        id: "log_attempt_logging",
        merchantId: "merchant_1",
        endpoint_url: "https://example.com/webhook",
        request_payload: { event: "payment.confirmed" },
        status: "retrying",
        retry_count: 1,
        max_retries: 5,
      };

      const mockMerchant = {
        id: "merchant_1",
        webhook_secret: "secret_123",
      };

      mockPrisma.webhookLog.findFirst.mockResolvedValue(mockLog);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockPrisma.webhookLog.update.mockResolvedValue({});

      // Simulate failed delivery
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 504,
        text: () => Promise.resolve("Gateway Timeout"),
      });

      const retryAttempts: any[] = [];
      mockPrisma.webhookRetryAttempt.create.mockImplementation((params: any) => {
        retryAttempts.push(params.data);
        return Promise.resolve({ id: "attempt_1" });
      });

      await retryWebhookService({ merchantId: "merchant_1", log_id: "log_attempt_logging" });

      expect(retryAttempts).toHaveLength(1);
      expect(retryAttempts[0]).toMatchObject({
        webhookLogId: "log_attempt_logging",
        attempt_number: 2, // retry_count was 1, now 2
        http_status: 504,
        response_body: "Gateway Timeout",
      });
    });

    it("should log error message when fetch throws exception", async () => {
      const mockLog = {
        id: "log_error",
        merchantId: "merchant_1",
        endpoint_url: "https://example.com/webhook",
        request_payload: { event: "payment.confirmed" },
        status: "retrying",
        retry_count: 0,
        max_retries: 5,
      };

      const mockMerchant = {
        id: "merchant_1",
        webhook_secret: "secret_123",
      };

      mockPrisma.webhookLog.findFirst.mockResolvedValue(mockLog);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockPrisma.webhookLog.update.mockResolvedValue({});

      // Simulate network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network connection failed"));

      const retryAttempts: any[] = [];
      mockPrisma.webhookRetryAttempt.create.mockImplementation((params: any) => {
        retryAttempts.push(params.data);
        return Promise.resolve({ id: "attempt_error" });
      });

      await retryWebhookService({ merchantId: "merchant_1", log_id: "log_error" });

      expect(retryAttempts).toHaveLength(1);
      expect(retryAttempts[0].error_message).toContain("Network connection failed");
      expect(retryAttempts[0].http_status).toBeUndefined();
    });
  });

  describe("deliverWebhook - Timeout Handling", () => {
    it("should timeout after 30 seconds", async () => {
      jest.useFakeTimers();

      const deliveryPromise = deliverWebhook(
        "https://slow-endpoint.com/webhook",
        { event: "test" },
        "secret"
      );

      // Advance timers to trigger timeout
      jest.advanceTimersByTime(30000);

      const result = await deliveryPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      jest.useRealTimers();
    });

    it("should complete successfully before timeout", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      const result = await deliverWebhook(
        "https://fast-endpoint.com/webhook",
        { event: "test" },
        "secret"
      );

      expect(result.success).toBe(true);
      expect(result.httpStatus).toBe(200);
    });
  });

  describe("HTTP Status Code Handling", () => {
    const testCases = [
      { status: 200, expected: true, description: "200 OK" },
      { status: 201, expected: true, description: "201 Created" },
      { status: 204, expected: true, description: "204 No Content" },
      { status: 400, expected: false, description: "400 Bad Request" },
      { status: 401, expected: false, description: "401 Unauthorized" },
      { status: 403, expected: false, description: "403 Forbidden" },
      { status: 404, expected: false, description: "404 Not Found" },
      { status: 429, expected: false, description: "429 Too Many Requests" },
      { status: 500, expected: false, description: "500 Internal Server Error" },
      { status: 502, expected: false, description: "502 Bad Gateway" },
      { status: 503, expected: false, description: "503 Service Unavailable" },
      { status: 504, expected: false, description: "504 Gateway Timeout" },
    ];

    testCases.forEach(({ status, expected, description }) => {
      it(`should handle ${description} correctly`, async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: status >= 200 && status < 300,
          status,
          text: () => Promise.resolve(`Response ${status}`),
        });

        const result = await deliverWebhook(
          "https://example.com/webhook",
          { event: "test" },
          "secret"
        );

        expect(result.success).toBe(expected);
        expect(result.httpStatus).toBe(status);
      });
    });
  });

  describe("Response Body Truncation", () => {
    it("should truncate response body to 10000 characters", async () => {
      const longResponse = "x".repeat(15000);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(longResponse),
      });

      const result = await deliverWebhook(
        "https://example.com/webhook",
        { event: "test" },
        "secret"
      );

      expect(result.responseBody?.length).toBe(10000);
      expect(result.responseBody).toBe("x".repeat(10000));
    });

    it("should not truncate short response bodies", async () => {
      const shortResponse = "OK";

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(shortResponse),
      });

      const result = await deliverWebhook(
        "https://example.com/webhook",
        { event: "test" },
        "secret"
      );

      expect(result.responseBody).toBe("OK");
    });
  });
});
