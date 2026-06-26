process.env.USDC_ISSUER_PUBLIC_KEY = process.env.USDC_ISSUER_PUBLIC_KEY || "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";
process.env.STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.FUNDER_SECRET_KEY = "SA5V5N44OEQ5FDE3WIF5M7BHLD6NRLJ72S2VPEI5MY56PNTLIXA5YYG6";
process.env.MASTER_VAULT_SECRET_KEY = "SA5V5N44OEQ5FDE3WIF5M7BHLD6NRLJ72S2VPEI5MY56PNTLIXA5YYG6";
process.env.HD_WALLET_MASTER_SEED = "test-seed-xyz";
process.env.KMS_PROVIDER = "local";

jest.mock("ioredis", () => {
  const store = new Map<string, string>();

  return jest.fn().mockImplementation(() => ({
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(key)) {
        return null;
      }
      store.set(key, value);
      return "OK";
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    keys: jest.fn(async () => Array.from(store.keys())),
    quit: jest.fn().mockResolvedValue("OK"),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  }));
});

import request from "supertest";
import { app } from "../../app";
import { PrismaClient } from "../../generated/client/client";
import { v4 as uuidv4 } from "uuid";
import { redisClient } from "../../middleware/redisIdempotency.middleware";

const prisma = new PrismaClient();

// Disable actual rate limits/auth for tests if possible, or mock them
jest.mock("../../middleware/apiKeyAuth.middleware", () => ({
  authenticateApiKey: (req: any, res: any, next: any) => {
    req.merchantId = "test_merchant_id";
    next();
  },
}));

jest.mock("../../middleware/rateLimit.middleware", () => ({
  merchantApiKeyRateLimit: () => (req: any, res: any, next: any) => next(),
  globalRateLimit: () => (req: any, res: any, next: any) => next(),
  merchantRateLimit: () => (req: any, res: any, next: any) => next(),
  authRateLimit: () => (req: any, res: any, next: any) => next(),
}));

jest.mock("../../services/payment.service", () => ({
  PaymentService: {
    checkRateLimit: jest.fn().mockResolvedValue(true),
    createPayment: jest.fn().mockImplementation((data) => {
      return Promise.resolve({
        id: "pay_123",
        amount: data.amount,
        currency: data.currency,
        checkout_url: "http://localhost:3001/pay/pay_123",
      });
    }),
  }
}));

jest.mock("@stellar/stellar-sdk", () => {
  return {
    ...jest.requireActual("@stellar/stellar-sdk"),
    Asset: class Asset {
      constructor() {}
    },
    Horizon: {
      Server: class Server {
        constructor() {}
      }
    }
  };
});


describe("POST /api/v1/charges Integration", () => {
  beforeAll(async () => {
    // connect to a real or mock redis for integration testing
    // in this case we're using whatever the CI/test environment provides
  });

  afterAll(async () => {
    await redisClient.quit();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  it("should create a charge on first request and replay on retry", async () => {
    const idempotencyKey = uuidv4();
    const payload = {
      amount: 100,
      currency: "USDC",
      customer_email: "test@example.com",
    };

    // Mock cache miss for first request is automatic since redis is empty
    
    // First request
    const res1 = await request(app)
      .post("/api/v1/charges")
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    expect(res1.body).toHaveProperty("id", "pay_123");

    // Second request (retry)
    const res2 = await request(app)
      .post("/api/v1/charges")
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.headers["idempotency-replayed"]).toBe("true");
    expect(res2.body).toEqual(res1.body);
  });

  it("should return 409 for in-flight requests", async () => {
    const idempotencyKey = uuidv4();
    const payload = {
      amount: 100,
      currency: "USDC",
      customer_email: "test@example.com",
    };

    // Simulate in-flight by setting redis value directly
    await redisClient.set(`idempotency:test_merchant_id:${idempotencyKey}`, "in-flight");

    const res = await request(app)
      .post("/api/v1/charges")
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("code", "IDEMPOTENCY_CONFLICT");
  });
});
