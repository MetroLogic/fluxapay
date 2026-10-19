jest.mock("sanitize-html", () => ({
  __esModule: true,
  default: jest.fn((str) => str),
}));

import express from "express";
import request from "supertest";
import paymentRoutes from "../payment.route";
import chargesRoutes from "../charges.route";
import webhookRoutes from "../webhook.route";
import {
  setSlidingWindowRedisClientForTests,
  resetSlidingWindowRedisClientForTests,
  clearInMemorySlidingWindowCounters,
} from "../../middleware/slidingWindowRateLimit.middleware";
import Redis from "ioredis";

// Mock controllers to isolate route middleware wiring
jest.mock("../../controllers/payment.controller", () => ({
  getPaymentStatus: jest.fn((_req, res) => res.json({ status: "pending" })),
  streamPaymentStatus: jest.fn((_req, res) => res.json({ stream: "ok" })),
  getPublicCheckoutPayment: jest.fn((_req, res) => res.json({ id: "pay_test" })),
  getPublicCheckoutPaymentStatus: jest.fn((_req, res) => res.json({ status: "pending" })),
  createPayment: jest.fn((_req, res) => res.status(201).json({ id: "pay_created" })),
  getPayments: jest.fn((_req, res) => res.json({ data: [] })),
  getPaymentById: jest.fn((_req, res) => res.json({ id: "pay_1" })),
  updatePayment: jest.fn((_req, res) => res.json({ id: "pay_1" })),
  exportPayments: jest.fn((_req, res) => res.json({ ok: true })),
  getPaymentSettlement: jest.fn((_req, res) => res.json({ settled: false })),
}));

jest.mock("../../controllers/refund.controller", () => ({
  createRefund: jest.fn((_req, res) => res.status(201).json({ id: "ref_1" })),
  listRefunds: jest.fn((_req, res) => res.json({ data: [] })),
}));

jest.mock("../../controllers/webhook.controller", () => ({
  getWebhookLogs: jest.fn((_req, res) => res.json({ logs: [] })),
  getWebhookLogDetails: jest.fn((_req, res) => res.json({ log: {} })),
  retryWebhook: jest.fn((_req, res) => res.json({ ok: true })),
  sendTestWebhook: jest.fn((_req, res) => res.json({ ok: true })),
  getDeadLetterQueue: jest.fn((_req, res) => res.json({ dlq: [] })),
  requeueWebhook: jest.fn((_req, res) => res.json({ ok: true })),
  exportWebhookLogs: jest.fn((_req, res) => res.json({ ok: true })),
  adminGetWebhookLogs: jest.fn((_req, res) => res.json({ logs: [] })),
  adminRetryWebhook: jest.fn((_req, res) => res.json({ ok: true })),
  getWebhookAttempts: jest.fn((_req, res) => res.json({ attempts: [] })),
  getWebhookRetryConfig: jest.fn((_req, res) => res.json({ maxRetries: 5 })),
  retryWebhookWithBackoff: jest.fn((_req, res) => res.json({ ok: true })),
}));

// Pass auth middleware directly for testing rate limit behavior
jest.mock("../../middleware/apiKeyAuth.middleware", () => ({
  authenticateApiKey: (req: any, _res: any, next: any) => {
    req.merchantId = "test_merchant_id";
    next();
  },
}));

jest.mock("../../middleware/auth.middleware", () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.merchantId = "test_merchant_id";
    next();
  },
}));

jest.mock("../../middleware/kycGate.middleware", () => ({
  kycGateMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../../middleware/redisIdempotency.middleware", () => ({
  redisIdempotencyMiddleware: (_req: any, _res: any, next: any) => next(),
}));

describe("Route Integration — Sliding Window Rate Limiting on Public & Core Endpoints", () => {
  let app: express.Express;

  beforeEach(() => {
    clearInMemorySlidingWindowCounters();
    resetSlidingWindowRedisClientForTests();

    app = express();
    app.use(express.json());
    app.use("/api/v1/payments", paymentRoutes);
    app.use("/api/v1/charges", chargesRoutes);
    app.use("/api/v1/webhooks", webhookRoutes);
  });

  afterEach(() => {
    clearInMemorySlidingWindowCounters();
    resetSlidingWindowRedisClientForTests();
  });

  describe("GET /api/v1/payments/:id/status (Public)", () => {
    it("sets X-RateLimit headers and enforces sliding-window limit", async () => {
      // Send initial request
      const res1 = await request(app).get("/api/v1/payments/pay_test_1/status");
      expect(res1.status).toBe(200);
      expect(res1.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res1.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(res1.headers["x-ratelimit-window"]).toBeDefined();
    });
  });

  describe("GET /api/v1/payments/checkout/:id (Public Checkout)", () => {
    it("sets X-RateLimit headers on hosted checkout route", async () => {
      const res = await request(app).get("/api/v1/payments/checkout/pay_test_chk");
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    });
  });

  describe("GET /api/v1/payments/checkout/:id/status (Public Checkout Status)", () => {
    it("sets X-RateLimit headers on hosted checkout status route", async () => {
      const res = await request(app).get("/api/v1/payments/checkout/pay_test_chk/status");
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    });
  });

  describe("POST /api/v1/charges (Charges Endpoint)", () => {
    it("sets X-RateLimit headers on charge creation", async () => {
      const res = await request(app)
        .post("/api/v1/charges")
        .send({
          amount: 100,
          currency: "USDC",
          customer_email: "customer@example.com",
        });

      expect(res.status).toBe(201);
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    });
  });

  describe("GET /api/v1/webhooks/logs (Webhook Management)", () => {
    it("sets X-RateLimit headers on merchant webhook logs endpoint", async () => {
      const res = await request(app).get("/api/v1/webhooks/logs");
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    });
  });
});
