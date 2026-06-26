import { Request, Response, NextFunction } from "express";
import { redisIdempotencyMiddleware, redisClient } from "../redisIdempotency.middleware";
import { v4 as uuidv4 } from "uuid";

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => {
    return {
      set: jest.fn(),
      get: jest.fn(),
    };
  });
});

describe("Redis Idempotency Middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      headers: {},
      merchantId: "merch_123",
    } as Partial<Request> & { merchantId: string };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should return 400 if Idempotency-Key is missing", async () => {
    await redisIdempotencyMiddleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: "MISSING_IDEMPOTENCY_KEY",
      message: "Missing Idempotency-Key header.",
    });
  });

  it("should return 400 if Idempotency-Key is not a valid UUID", async () => {
    req.headers!["idempotency-key"] = "invalid-key";
    await redisIdempotencyMiddleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "INVALID_IDEMPOTENCY_KEY",
        message: expect.stringContaining("Invalid Idempotency-Key format"),
      }),
    );
  });

  it("should call next() if key is unique and setnx succeeds", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    (redisClient.set as jest.Mock).mockResolvedValueOnce("OK");

    await redisIdempotencyMiddleware(req as Request, res as Response, next);
    
    expect(redisClient.set).toHaveBeenCalledWith(
      `idempotency:merch_123:${key}`,
      "in-flight",
      "EX",
      86400,
      "NX"
    );
    expect(next).toHaveBeenCalled();
  });

  it("should return 409 if request is in-flight", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    (redisClient.set as jest.Mock).mockResolvedValueOnce(null); // NX failed
    (redisClient.get as jest.Mock).mockResolvedValueOnce("in-flight"); // value is in-flight

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(redisClient.get).toHaveBeenCalledWith(`idempotency:merch_123:${key}`);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "IDEMPOTENCY_CONFLICT",
        message: "A request with this idempotency key is already in progress.",
      }),
    );
  });

  it("should return 200 with replayed response if completed", async () => {
    const key = uuidv4();
    req.headers!["idempotency-key"] = key;
    (redisClient.set as jest.Mock).mockResolvedValueOnce(null); // NX failed
    
    const cachedResponse = { status: 201, body: { id: "pay_123" } };
    (redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedResponse));

    await redisIdempotencyMiddleware(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(cachedResponse.body);
  });
});
