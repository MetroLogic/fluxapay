import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { redisIdempotencyMiddleware, redisClient } from "../redisIdempotency.middleware";
import { v4 as uuidv4 } from "uuid";

// Use the global __mocks__/ioredis mock
jest.mock("ioredis");

// Helper to deterministically hash a body the same way the middleware does
function hashBody(body: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

describe("redisIdempotencyMiddleware", () => {
  let req: Partial<Request & { merchantId?: string }>;
  let res: Partial<Response>;
  let next: NextFunction;

  const MERCHANT_ID = "merch_test_123";
  const VALID_BODY = { amount: 100, currency: "USDC" };

  beforeEach(() => {
    req = {
      headers: {},
      body: VALID_BODY,
      merchantId: MERCHANT_ID,
    } as Partial<Request> & { merchantId: string };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      statusCode: 200,
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 when Idempotency-Key header is missing", async () => {
    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "MISSING_IDEMPOTENCY_KEY" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 when Idempotency-Key is not a valid UUID v4", async () => {
    req.headers!["idempotency-key"] = "not-a-uuid";

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_IDEMPOTENCY_KEY" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when merchantId is missing from the request", async () => {
    req.headers!["idempotency-key"] = uuidv4();
    delete (req as any).merchantId;

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  // ── Cache miss ────────────────────────────────────────────────────────────

  it("calls next() and patches res.json on a cache miss (new key)", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    (redisClient.set as jest.Mock).mockResolvedValueOnce("OK"); // NX succeeds

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(redisClient.set).toHaveBeenCalledWith(
      `idempotency:${MERCHANT_ID}:${key}`,
      "in-flight",
      "EX",
      86400,
      "NX",
    );
    expect(next).toHaveBeenCalled();
    // res.json should have been patched
    expect(typeof res.json).toBe("function");
  });

  it("persists the response to Redis when res.json is called after a cache miss", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    (redisClient.set as jest.Mock)
      .mockResolvedValueOnce("OK") // NX claim
      .mockResolvedValueOnce("OK"); // persist after res.json

    await redisIdempotencyMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();

    // Simulate the controller calling res.json
    Object.defineProperty(res, "statusCode", { value: 201, writable: true });
    res.json!({ id: "pay_001" });

    // Give the async Redis.set a tick to run
    await new Promise((r) => setImmediate(r));

    const expectedCached = JSON.stringify({
      status: 201,
      body: { id: "pay_001" },
      requestHash: hashBody(VALID_BODY),
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      `idempotency:${MERCHANT_ID}:${key}`,
      expectedCached,
      "EX",
      86400,
    );
  });

  // ── In-flight (concurrent) request ───────────────────────────────────────

  it("returns 409 when a concurrent request holds the in-flight sentinel", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    (redisClient.set as jest.Mock).mockResolvedValueOnce(null); // NX failed
    (redisClient.get as jest.Mock).mockResolvedValueOnce("in-flight");

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  // ── Replay (cache hit, matching body) ────────────────────────────────────

  it("replays the cached response with original status code and Idempotency-Replayed header", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    req.body = VALID_BODY;

    const cachedEntry = {
      status: 201,
      body: { id: "pay_001", amount: 100 },
      requestHash: hashBody(VALID_BODY),
    };

    (redisClient.set as jest.Mock).mockResolvedValueOnce(null); // NX failed
    (redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedEntry));

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(cachedEntry.body);
    expect(next).not.toHaveBeenCalled();
  });

  it("uses the original status code (not 200) when replaying a 201 response", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;

    const cachedEntry = {
      status: 201,
      body: { id: "pay_999" },
      requestHash: hashBody(VALID_BODY),
    };
    (redisClient.set as jest.Mock).mockResolvedValueOnce(null);
    (redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedEntry));

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    // Critically: must NOT be 200 — must replay the original 201
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.status).not.toHaveBeenCalledWith(200);
  });

  // ── Payload mismatch (conflict) ───────────────────────────────────────────

  it("returns 422 when same key is reused with a different request body", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    req.body = { amount: 999, currency: "USDC" }; // different from cached hash

    const cachedEntry = {
      status: 201,
      body: { id: "pay_001" },
      requestHash: hashBody(VALID_BODY), // original body hash
    };
    (redisClient.set as jest.Mock).mockResolvedValueOnce(null);
    (redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedEntry));

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "IDEMPOTENCY_CONFLICT" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("calls next() when NX failed but the value has since expired (null GET)", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    (redisClient.set as jest.Mock).mockResolvedValueOnce(null);
    (redisClient.get as jest.Mock).mockResolvedValueOnce(null);

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it("returns 500 when Redis throws an unexpected error", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    (redisClient.set as jest.Mock).mockRejectedValueOnce(new Error("Redis down"));

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "IDEMPOTENCY_CHECK_FAILED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
