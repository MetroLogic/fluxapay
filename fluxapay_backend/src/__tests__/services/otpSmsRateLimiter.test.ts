/**
 * Unit tests for otpSmsRateLimiter.ts
 *
 * Verifies:
 *  1. Per-phone rate limit (max 5 per 10-minute window)
 *  2. Per-IP distinct-phones rate limit (max 3 phones per IP per hour)
 *  3. HTTP 429 status + retryAfterSeconds on both limit types
 *  4. Security audit entries logged on every limit hit
 *  5. Allowed sends are logged
 *  6. Redis unavailability → fail-open (send allowed)
 *  7. Counters reset correctly across windows (TTL behaviour)
 */

// ── Redis mock ─────────────────────────────────────────────────────────────────

jest.mock("ioredis");

import Redis from "ioredis";

// Build a lightweight in-memory Redis mock that supports the subset of
// commands used by the rate limiter: INCR, EXPIRE, TTL, SADD, SCARD, SREM, DECR.
function buildRedisMock() {
  const store = new Map<string, { value: string | number | Set<string>; expiresAt?: number }>();

  function isExpired(key: string): boolean {
    const entry = store.get(key);
    if (!entry) return true;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      store.delete(key);
      return true;
    }
    return false;
  }

  return {
    _store: store,
    async incr(key: string): Promise<number> {
      if (isExpired(key)) {
        store.set(key, { value: 1 });
        return 1;
      }
      const entry = store.get(key)!;
      const next = (Number(entry.value) || 0) + 1;
      entry.value = next;
      return next;
    },
    async decr(key: string): Promise<number> {
      if (isExpired(key)) return 0;
      const entry = store.get(key)!;
      const next = Math.max(0, (Number(entry.value) || 0) - 1);
      entry.value = next;
      return next;
    },
    async expire(key: string, seconds: number): Promise<number> {
      const entry = store.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    async ttl(key: string): Promise<number> {
      if (isExpired(key)) return -2;
      const entry = store.get(key);
      if (!entry || entry.expiresAt === undefined) return -1;
      return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    },
    async sadd(key: string, member: string): Promise<number> {
      if (isExpired(key)) {
        store.set(key, { value: new Set([member]) });
        return 1;
      }
      const entry = store.get(key)!;
      const s = entry.value as Set<string>;
      if (s.has(member)) return 0;
      s.add(member);
      return 1;
    },
    async scard(key: string): Promise<number> {
      if (isExpired(key)) return 0;
      const entry = store.get(key);
      if (!entry) return 0;
      return (entry.value as Set<string>).size;
    },
    async srem(key: string, member: string): Promise<number> {
      if (isExpired(key)) return 0;
      const entry = store.get(key);
      if (!entry) return 0;
      const removed = (entry.value as Set<string>).delete(member);
      return removed ? 1 : 0;
    },
    on(_event: string, _handler: (...args: any[]) => void): this {
      return this;
    },
  };
}

// ── Imports (after mock setup) ─────────────────────────────────────────────────

import {
  assertOtpSmsRateLimits,
  setRedisClientForTests,
  resetRedisClientForTests,
} from "../../sms/otpSmsRateLimiter";

// ── Helpers ────────────────────────────────────────────────────────────────────

const PHONE_A = "+15551110001";
const PHONE_B = "+15551110002";
const PHONE_C = "+15551110003";
const PHONE_D = "+15551110004";
const IP_A = "1.2.3.4";
const IP_B = "5.6.7.8";

async function sendOtp(phone: string, ip: string): Promise<void> {
  await assertOtpSmsRateLimits(phone, ip);
}

/** Call sendOtp n times, ignoring errors. Returns count of successes. */
async function sendOtpN(phone: string, ip: string, n: number): Promise<number> {
  let successes = 0;
  for (let i = 0; i < n; i++) {
    try {
      await sendOtp(phone, ip);
      successes++;
    } catch {
      // expected 429
    }
  }
  return successes;
}

// ── Setup ──────────────────────────────────────────────────────────────────────

let redisMock: ReturnType<typeof buildRedisMock>;

beforeEach(() => {
  redisMock = buildRedisMock();
  setRedisClientForTests(redisMock as unknown as Redis);

  // Set known limits via env so tests don't depend on production defaults
  process.env.OTP_PHONE_MAX_PER_WINDOW = "5";
  process.env.OTP_PHONE_WINDOW_SECONDS = "600";
  process.env.OTP_IP_MAX_PHONES_PER_HOUR = "3";
});

afterEach(() => {
  resetRedisClientForTests();
  delete process.env.OTP_PHONE_MAX_PER_WINDOW;
  delete process.env.OTP_PHONE_WINDOW_SECONDS;
  delete process.env.OTP_IP_MAX_PHONES_PER_HOUR;
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("assertOtpSmsRateLimits — per-phone limit", () => {
  it("allows up to the configured maximum sends", async () => {
    const successes = await sendOtpN(PHONE_A, IP_A, 5);
    expect(successes).toBe(5);
  });

  it("blocks the 6th send in the same window", async () => {
    await sendOtpN(PHONE_A, IP_A, 5); // exhaust the limit

    await expect(sendOtp(PHONE_A, IP_A)).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("phone number"),
    });
  });

  it("returns retryAfterSeconds > 0 when phone limit exceeded", async () => {
    await sendOtpN(PHONE_A, IP_A, 5);

    let caught: any;
    try {
      await sendOtp(PHONE_A, IP_A);
    } catch (err) {
      caught = err;
    }

    expect(caught?.status).toBe(429);
    expect(typeof caught?.retryAfterSeconds).toBe("number");
    expect(caught.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("treats different phone numbers as independent counters", async () => {
    await sendOtpN(PHONE_A, IP_A, 5); // exhaust PHONE_A

    // PHONE_B should still be allowed (on the same IP, but IP limit not reached)
    await expect(sendOtp(PHONE_B, IP_A)).resolves.toBeUndefined();
  });

  it("resets after the TTL window expires", async () => {
    await sendOtpN(PHONE_A, IP_A, 5);

    // Simulate window expiry by manipulating the mock store's expiry
    const key = `otp:phone:${PHONE_A}`;
    const entry = redisMock._store.get(key)!;
    entry.expiresAt = Date.now() - 1; // expired

    // Should now be allowed again
    await expect(sendOtp(PHONE_A, IP_A)).resolves.toBeUndefined();
  });
});

describe("assertOtpSmsRateLimits — per-IP distinct-phones limit", () => {
  it("allows up to the configured distinct phones per IP", async () => {
    await expect(sendOtp(PHONE_A, IP_A)).resolves.toBeUndefined();
    await expect(sendOtp(PHONE_B, IP_A)).resolves.toBeUndefined();
    await expect(sendOtp(PHONE_C, IP_A)).resolves.toBeUndefined();
  });

  it("blocks a 4th distinct phone number from the same IP", async () => {
    await sendOtp(PHONE_A, IP_A);
    await sendOtp(PHONE_B, IP_A);
    await sendOtp(PHONE_C, IP_A);

    await expect(sendOtp(PHONE_D, IP_A)).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("IP address"),
    });
  });

  it("returns retryAfterSeconds > 0 when IP limit exceeded", async () => {
    await sendOtp(PHONE_A, IP_A);
    await sendOtp(PHONE_B, IP_A);
    await sendOtp(PHONE_C, IP_A);

    let caught: any;
    try {
      await sendOtp(PHONE_D, IP_A);
    } catch (err) {
      caught = err;
    }

    expect(caught?.status).toBe(429);
    expect(typeof caught?.retryAfterSeconds).toBe("number");
    expect(caught.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not count the same phone number twice against the IP limit", async () => {
    // Sending to PHONE_A multiple times should only count as 1 distinct phone
    await sendOtp(PHONE_A, IP_A);
    await sendOtp(PHONE_A, IP_A);
    await sendOtp(PHONE_A, IP_A);

    // Should still be able to send to two more phones before hitting the 3-phone limit
    await expect(sendOtp(PHONE_B, IP_A)).resolves.toBeUndefined();
    await expect(sendOtp(PHONE_C, IP_A)).resolves.toBeUndefined();
  });

  it("treats different IPs as independent counters", async () => {
    // Exhaust IP_A
    await sendOtp(PHONE_A, IP_A);
    await sendOtp(PHONE_B, IP_A);
    await sendOtp(PHONE_C, IP_A);
    await expect(sendOtp(PHONE_D, IP_A)).rejects.toMatchObject({ status: 429 });

    // IP_B should still allow PHONE_D
    await expect(sendOtp(PHONE_D, IP_B)).resolves.toBeUndefined();
  });

  it("rolls back phone counter when IP limit is exceeded", async () => {
    await sendOtp(PHONE_A, IP_A);
    await sendOtp(PHONE_B, IP_A);
    await sendOtp(PHONE_C, IP_A);

    // PHONE_D triggers IP limit — its phone counter should be rolled back
    try { await sendOtp(PHONE_D, IP_A); } catch { /* expected */ }

    // Direct check: the phone key for PHONE_D should be 0 (rolled back)
    const phoneKey = `otp:phone:${PHONE_D}`;
    const phoneEntry = redisMock._store.get(phoneKey);
    // Either the key doesn't exist (never set) or value is 0 after decr
    const phoneCount = phoneEntry ? Number(phoneEntry.value) : 0;
    expect(phoneCount).toBe(0);
  });
});

describe("assertOtpSmsRateLimits — security audit logging", () => {
  it("logs a warning when the phone limit is exceeded", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await sendOtpN(PHONE_A, IP_A, 5);
    try { await sendOtp(PHONE_A, IP_A); } catch { /* expected */ }

    const calls = warnSpy.mock.calls.map((c) => {
      try { return JSON.parse(c[0]); } catch { return null; }
    }).filter(Boolean);

    expect(calls.some((e) => e.event === "otp_rate_limit_phone")).toBe(true);
    warnSpy.mockRestore();
  });

  it("logs a warning when the IP limit is exceeded", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await sendOtp(PHONE_A, IP_A);
    await sendOtp(PHONE_B, IP_A);
    await sendOtp(PHONE_C, IP_A);
    try { await sendOtp(PHONE_D, IP_A); } catch { /* expected */ }

    const calls = warnSpy.mock.calls.map((c) => {
      try { return JSON.parse(c[0]); } catch { return null; }
    }).filter(Boolean);

    expect(calls.some((e) => e.event === "otp_rate_limit_ip")).toBe(true);
    warnSpy.mockRestore();
  });

  it("logs an info entry for allowed sends", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await sendOtp(PHONE_A, IP_A);

    const calls = warnSpy.mock.calls.map((c) => {
      try { return JSON.parse(c[0]); } catch { return null; }
    }).filter(Boolean);

    expect(calls.some((e) => e.event === "otp_send_allowed")).toBe(true);
    warnSpy.mockRestore();
  });

  it("never logs a full phone number in audit entries", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await sendOtp(PHONE_A, IP_A);

    for (const [rawLog] of warnSpy.mock.calls) {
      expect(rawLog).not.toContain(PHONE_A);
    }
    warnSpy.mockRestore();
  });
});

describe("assertOtpSmsRateLimits — Redis unavailability (fail-open)", () => {
  it("allows the send when Redis throws on INCR", async () => {
    const brokenMock = {
      ...redisMock,
      incr: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };
    setRedisClientForTests(brokenMock as unknown as Redis);

    // Should not throw — fail-open policy
    await expect(sendOtp(PHONE_A, IP_A)).resolves.toBeUndefined();
  });

  it("allows the send when Redis throws on SADD", async () => {
    const brokenMock = {
      ...redisMock,
      sadd: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };
    setRedisClientForTests(brokenMock as unknown as Redis);

    await expect(sendOtp(PHONE_A, IP_A)).resolves.toBeUndefined();
  });
});
