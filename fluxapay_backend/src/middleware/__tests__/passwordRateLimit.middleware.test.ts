import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import { setRedisClientForTests, resetRedisClientForTests } from "../rateLimit.middleware";
import { forgotPasswordRateLimit, resetPasswordRateLimit } from "../rateLimit.middleware";

function createMemoryRedisMock() {
  const counts = new Map<string, number>();
  return {
    incr: jest.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(30),
    on: jest.fn(),
  } as unknown as Redis;
}

describe("Password rate limit middleware", () => {
  let mockReq: any;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    mockReq = { ip: "127.0.0.1", path: "/api/v1/forgot-password", body: { email: "victim@example.com" } };
    mockRes = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    next = jest.fn();
    resetRedisClientForTests();
    setRedisClientForTests(createMemoryRedisMock());
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetRedisClientForTests();
  });

  it("blocks after email limit exceeded", async () => {
    const mw = forgotPasswordRateLimit();
    for (let i = 0; i < 5; i++) {
      // allowed
      // @ts-ignore
      await mw(mockReq as Request, mockRes as Response, next);
    }

    // 6th request should be blocked
    // @ts-ignore
    await mw(mockReq as Request, mockRes as Response, next);
    expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });

  it("blocks reset-password after IP limit exceeded", async () => {
    const mw = resetPasswordRateLimit();
    mockReq.path = "/api/v1/reset-password";
    for (let i = 0; i < 10; i++) {
      // @ts-ignore
      await mw(mockReq as Request, mockRes as Response, next);
    }

    // 11th request should be blocked
    // @ts-ignore
    await mw(mockReq as Request, mockRes as Response, next);
    expect(mockRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });
});
