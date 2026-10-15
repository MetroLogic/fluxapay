/**
 * IP token bucket rate limiter tests.
 *
 * Mounts the middleware on a minimal Express app and drives it with supertest.
 * Redis is replaced by a fake client whose EVAL mirrors the Lua script, so the
 * suite runs without a live Redis while still exercising RedisTokenBucketStore.
 */

jest.mock("../rateLimit.middleware", () => ({
  getRedisClientForRateLimit: jest.fn(() => {
    throw new Error("Redis not available in tests");
  }),
}));

import express from "express";
import request from "supertest";
import type Redis from "ioredis";
import {
  ipRateLimit,
  isIpWhitelisted,
  normalizeIp,
  parseWhitelist,
  MemoryTokenBucketStore,
  RedisTokenBucketStore,
  TOKEN_BUCKET_LUA,
  TokenBucketStore,
  resetIpRateLimitFallbackForTests,
} from "../ipRateLimit.middleware";

/** Fake ioredis client: EVAL runs the same algorithm as TOKEN_BUCKET_LUA in memory. */
function createFakeRedis() {
  const memory = new MemoryTokenBucketStore();
  const evalMock = jest.fn(
    async (
      script: string,
      numKeys: number,
      key: string,
      capacity: string,
      refillPerMs: string,
      nowMs: string,
      ttlMs: string,
    ) => {
      expect(script).toBe(TOKEN_BUCKET_LUA);
      expect(numKeys).toBe(1);
      const r = await memory.take(key, Number(capacity), Number(refillPerMs), Number(nowMs), Number(ttlMs));
      return [r.allowed ? 1 : 0, String(r.tokens)];
    },
  );
  return { client: { eval: evalMock } as unknown as Redis, evalMock };
}

function buildApp(limiter: express.RequestHandler) {
  const app = express();
  app.set("trust proxy", true);
  app.get("/public/:id", limiter, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("ipRateLimit middleware", () => {
  let clock: number;
  const now = () => clock;

  const ENV_KEYS = [
    "PUBLIC_IP_RATE_LIMIT_CAPACITY",
    "PUBLIC_IP_RATE_LIMIT_REFILL_PER_SECOND",
    "PUBLIC_IP_RATE_LIMIT_DISABLED",
    "RATE_LIMIT_IP_WHITELIST",
    "TEST_RL_CAPACITY",
    "TEST_RL_REFILL_PER_SECOND",
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    clock = 1_700_000_000_000;
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    resetIpRateLimitFallbackForTests();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  function redisLimiter(opts: Partial<Parameters<typeof ipRateLimit>[0]> = {}) {
    const fake = createFakeRedis();
    const store = new RedisTokenBucketStore(() => fake.client);
    const limiter = ipRateLimit({
      name: "test",
      capacity: 3,
      refillPerSecond: 1,
      whitelist: [],
      store,
      now,
      ...opts,
    });
    return { limiter, evalMock: fake.evalMock };
  }

  it("allows requests up to capacity and sets X-RateLimit-* headers", async () => {
    const { limiter, evalMock } = redisLimiter();
    const app = buildApp(limiter);

    const first = await request(app).get("/public/a").set("X-Forwarded-For", "203.0.113.10");
    expect(first.status).toBe(200);
    expect(first.headers["x-ratelimit-limit"]).toBe("3");
    expect(first.headers["x-ratelimit-remaining"]).toBe("2");
    // One token spent at 1 token/s → bucket is full again 1s from now.
    expect(first.headers["x-ratelimit-reset"]).toBe(String(Math.ceil((clock + 1000) / 1000)));
    expect(first.headers["retry-after"]).toBeUndefined();

    const second = await request(app).get("/public/a").set("X-Forwarded-For", "203.0.113.10");
    const third = await request(app).get("/public/a").set("X-Forwarded-For", "203.0.113.10");
    expect(second.headers["x-ratelimit-remaining"]).toBe("1");
    expect(third.status).toBe(200);
    expect(third.headers["x-ratelimit-remaining"]).toBe("0");

    expect(evalMock).toHaveBeenCalledTimes(3);
    expect(evalMock.mock.calls[0][2]).toBe("iprl:test:203.0.113.10");
  });

  it("returns 429 with Retry-After once the bucket is empty", async () => {
    const { limiter } = redisLimiter();
    const app = buildApp(limiter);

    for (let i = 0; i < 3; i++) {
      await request(app).get("/public/a").set("X-Forwarded-For", "203.0.113.11");
    }
    const blocked = await request(app).get("/public/a").set("X-Forwarded-For", "203.0.113.11");

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(blocked.headers["retry-after"]).toBe("1");
    expect(blocked.headers["x-ratelimit-limit"]).toBe("3");
    expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");
    expect(blocked.headers["x-ratelimit-reset"]).toBe(String(Math.ceil((clock + 3000) / 1000)));
  });

  it("refills tokens over time", async () => {
    const { limiter } = redisLimiter();
    const app = buildApp(limiter);
    const ip = "203.0.113.12";

    for (let i = 0; i < 3; i++) {
      await request(app).get("/public/a").set("X-Forwarded-For", ip);
    }
    expect((await request(app).get("/public/a").set("X-Forwarded-For", ip)).status).toBe(429);

    clock += 2000; // two tokens refilled
    const afterRefill = await request(app).get("/public/a").set("X-Forwarded-For", ip);
    expect(afterRefill.status).toBe(200);
    expect(afterRefill.headers["x-ratelimit-remaining"]).toBe("1");
  });

  it("keeps separate buckets per IP", async () => {
    const { limiter } = redisLimiter({ capacity: 1 });
    const app = buildApp(limiter);

    expect((await request(app).get("/public/a").set("X-Forwarded-For", "198.51.100.1")).status).toBe(200);
    expect((await request(app).get("/public/a").set("X-Forwarded-For", "198.51.100.1")).status).toBe(429);
    expect((await request(app).get("/public/a").set("X-Forwarded-For", "198.51.100.2")).status).toBe(200);
  });

  it("skips whitelisted IPs and CIDR ranges without touching the store", async () => {
    const { limiter, evalMock } = redisLimiter({ capacity: 1, whitelist: ["10.0.0.0/8", "192.0.2.5"] });
    const app = buildApp(limiter);

    for (let i = 0; i < 5; i++) {
      const res = await request(app).get("/public/a").set("X-Forwarded-For", "10.1.2.3");
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
    }
    expect((await request(app).get("/public/a").set("X-Forwarded-For", "192.0.2.5")).status).toBe(200);
    expect((await request(app).get("/public/a").set("X-Forwarded-For", "192.0.2.5")).status).toBe(200);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("reads the whitelist from RATE_LIMIT_IP_WHITELIST", async () => {
    process.env.RATE_LIMIT_IP_WHITELIST = "127.0.0.1, 172.16.0.0/12";
    const { limiter } = redisLimiter({ capacity: 1, whitelist: undefined });
    const app = buildApp(limiter);

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get("/public/a").set("X-Forwarded-For", "172.20.1.1")).status).toBe(200);
    }
  });

  it("reads thresholds from env, with per-limiter overrides taking precedence", async () => {
    process.env.PUBLIC_IP_RATE_LIMIT_CAPACITY = "7";
    const globalOnly = buildApp(redisLimiter({ capacity: undefined }).limiter);
    expect((await request(globalOnly).get("/public/a")).headers["x-ratelimit-limit"]).toBe("7");

    process.env.TEST_RL_CAPACITY = "2";
    process.env.TEST_RL_REFILL_PER_SECOND = "0.5";
    const overridden = buildApp(redisLimiter({ envPrefix: "TEST_RL" }).limiter);
    const res = await request(overridden).get("/public/a");
    expect(res.headers["x-ratelimit-limit"]).toBe("2");
    // One token spent at 0.5 tokens/s → full again in 2s.
    expect(res.headers["x-ratelimit-reset"]).toBe(String(Math.ceil((clock + 2000) / 1000)));
  });

  it("falls back to the in-memory bucket when Redis errors", async () => {
    const failing: TokenBucketStore = {
      take: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };
    const app = buildApp(
      ipRateLimit({ name: "fallback", capacity: 2, refillPerSecond: 1, whitelist: [], store: failing, now }),
    );

    expect((await request(app).get("/public/a").set("X-Forwarded-For", "203.0.113.20")).status).toBe(200);
    expect((await request(app).get("/public/a").set("X-Forwarded-For", "203.0.113.20")).status).toBe(200);
    const blocked = await request(app).get("/public/a").set("X-Forwarded-For", "203.0.113.20");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("1");
  });

  it("uses the shared Redis store by default and still enforces limits if it is down", async () => {
    const app = buildApp(ipRateLimit({ name: "default-store", capacity: 1, refillPerSecond: 1, whitelist: [], now }));

    expect((await request(app).get("/public/a")).status).toBe(200);
    expect((await request(app).get("/public/a")).status).toBe(429);
  });

  it("can be disabled with PUBLIC_IP_RATE_LIMIT_DISABLED", async () => {
    process.env.PUBLIC_IP_RATE_LIMIT_DISABLED = "true";
    const { limiter, evalMock } = redisLimiter({ capacity: 1 });
    const app = buildApp(limiter);

    expect((await request(app).get("/public/a")).status).toBe(200);
    expect((await request(app).get("/public/a")).status).toBe(200);
    expect(evalMock).not.toHaveBeenCalled();
  });
});

describe("whitelist helpers", () => {
  it("normalizes IPv4-mapped IPv6 addresses", () => {
    expect(normalizeIp("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(normalizeIp("::1")).toBe("::1");
  });

  it("matches exact IPs and IPv4 CIDRs", () => {
    const list = parseWhitelist("10.0.0.0/8, 192.168.1.0/24,::1 ,");
    expect(list).toEqual(["10.0.0.0/8", "192.168.1.0/24", "::1"]);
    expect(isIpWhitelisted("10.255.0.1", list)).toBe(true);
    expect(isIpWhitelisted("::ffff:192.168.1.40", list)).toBe(true);
    expect(isIpWhitelisted("192.168.2.1", list)).toBe(false);
    expect(isIpWhitelisted("::1", list)).toBe(true);
    expect(isIpWhitelisted("11.0.0.1", list)).toBe(false);
  });

  it("ignores malformed entries", () => {
    expect(isIpWhitelisted("10.0.0.1", ["10.0.0.0/40", "not-an-ip/8", ""])).toBe(false);
  });
});

describe("MemoryTokenBucketStore", () => {
  it("never exceeds capacity while idle", async () => {
    const store = new MemoryTokenBucketStore();
    const t0 = 1_000_000;
    await store.take("k", 5, 0.001, t0, 60_000);
    const later = await store.take("k", 5, 0.001, t0 + 50_000, 60_000);
    expect(later.allowed).toBe(true);
    expect(later.tokens).toBe(4);
  });
});
