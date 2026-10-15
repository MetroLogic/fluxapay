import type { Request, Response, NextFunction, RequestHandler } from "express";
import type Redis from "ioredis";
import { ErrorCode } from "../types/errors";
import { apiError, sendApiError } from "../helpers/apiError.helper";
import { getRedisClientForRateLimit } from "./rateLimit.middleware";

/**
 * ipRateLimit.middleware.ts
 *
 * Redis-backed token bucket rate limiter for public, unauthenticated endpoints
 * (checkout status polling, payment status, payment link lookups).
 *
 * Each client IP owns a bucket of `capacity` tokens that refills continuously at
 * `refillPerSecond`. Every request spends one token; when the bucket is empty the
 * request is rejected with 429. Bursts up to `capacity` are allowed, while the
 * sustained rate is capped at `refillPerSecond`.
 *
 * The bucket lives in a Redis hash and is updated by a single Lua script, so the
 * read-refill-spend cycle is atomic and limits are shared by every API instance.
 * If Redis is unreachable the limiter falls back to an in-process bucket rather
 * than failing open, so a Redis outage never removes DoS protection.
 *
 * Response headers (on every response):
 *  - X-RateLimit-Limit:     bucket capacity
 *  - X-RateLimit-Remaining: whole tokens left after this request
 *  - X-RateLimit-Reset:     Unix epoch seconds when the bucket is full again
 *  - Retry-After:           seconds until one token is available (429 only)
 *
 * Environment variables:
 *  - PUBLIC_IP_RATE_LIMIT_CAPACITY           default bucket size (default: 60)
 *  - PUBLIC_IP_RATE_LIMIT_REFILL_PER_SECOND  default refill rate (default: 1)
 *  - <envPrefix>_CAPACITY / <envPrefix>_REFILL_PER_SECOND
 *                                            per-limiter overrides, e.g.
 *                                            CHECKOUT_RATE_LIMIT_CAPACITY
 *  - RATE_LIMIT_IP_WHITELIST                 comma-separated IPs or IPv4 CIDRs
 *                                            that bypass the limiter (internal
 *                                            services, health-check probes)
 *  - PUBLIC_IP_RATE_LIMIT_DISABLED           set to "true" to disable entirely
 */

export interface TokenBucketResult {
  allowed: boolean;
  /** Tokens left after this request (may be fractional). */
  tokens: number;
}

export interface TokenBucketStore {
  take(
    key: string,
    capacity: number,
    refillPerMs: number,
    nowMs: number,
    ttlMs: number,
  ): Promise<TokenBucketResult>;
}

/**
 * KEYS[1] = bucket key
 * ARGV[1] = capacity, ARGV[2] = refill per ms, ARGV[3] = now (ms), ARGV[4] = ttl (ms)
 * Returns { allowed (0|1), tokens (string, to keep the fraction) }.
 */
export const TOKEN_BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end

local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refill)

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', KEYS[1], ttl)
return { allowed, tostring(tokens) }
`;

export class RedisTokenBucketStore implements TokenBucketStore {
  constructor(private readonly getClient: () => Redis) {}

  async take(
    key: string,
    capacity: number,
    refillPerMs: number,
    nowMs: number,
    ttlMs: number,
  ): Promise<TokenBucketResult> {
    const reply = (await this.getClient().eval(
      TOKEN_BUCKET_LUA,
      1,
      key,
      String(capacity),
      String(refillPerMs),
      String(nowMs),
      String(ttlMs),
    )) as [number | string, string];

    return { allowed: Number(reply[0]) === 1, tokens: Number(reply[1]) };
  }
}

/** Same algorithm as the Lua script, kept in process memory. */
export class MemoryTokenBucketStore implements TokenBucketStore {
  private readonly buckets = new Map<string, { tokens: number; ts: number; expiresAt: number }>();

  async take(
    key: string,
    capacity: number,
    refillPerMs: number,
    nowMs: number,
    ttlMs: number,
  ): Promise<TokenBucketResult> {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= nowMs) {
      bucket = { tokens: capacity, ts: nowMs, expiresAt: 0 };
    }

    const elapsed = Math.max(0, nowMs - bucket.ts);
    let tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);

    let allowed = false;
    if (tokens >= 1) {
      tokens -= 1;
      allowed = true;
    }

    this.buckets.set(key, { tokens, ts: nowMs, expiresAt: nowMs + ttlMs });
    this.sweep(nowMs);
    return { allowed, tokens };
  }

  clear(): void {
    this.buckets.clear();
  }

  /** Drop expired buckets so the fallback map cannot grow without bound. */
  private sweep(nowMs: number): void {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets) {
      if (b.expiresAt <= nowMs) this.buckets.delete(k);
    }
  }
}

export interface IpRateLimitOptions {
  /** Short name used in the Redis key, e.g. "checkout". */
  name: string;
  /** Bucket size (max burst). Falls back to env, then 60. */
  capacity?: number;
  /** Tokens added per second (sustained rate). Falls back to env, then 1. */
  refillPerSecond?: number;
  /** Env var prefix for per-limiter overrides, e.g. "CHECKOUT_RATE_LIMIT". */
  envPrefix?: string;
  /** IPs / IPv4 CIDRs that bypass the limiter. Defaults to RATE_LIMIT_IP_WHITELIST. */
  whitelist?: string[];
  /** Store override (tests). Defaults to Redis with an in-memory fallback. */
  store?: TokenBucketStore;
  /** Fallback store used when the primary store throws. */
  fallbackStore?: TokenBucketStore;
  /** Clock override (tests). */
  now?: () => number;
}

const KEY_PREFIX = "iprl";
const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_PER_SECOND = 1;

const sharedFallbackStore = new MemoryTokenBucketStore();
const sharedRedisStore = new RedisTokenBucketStore(getRedisClientForRateLimit);

/** Clears the shared in-memory fallback buckets (tests). */
export function resetIpRateLimitFallbackForTests(): void {
  sharedFallbackStore.clear();
}

function readPositiveNumber(...values: Array<string | number | undefined>): number | undefined {
  for (const v of values) {
    if (v === undefined || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Strips the IPv4-mapped IPv6 prefix so "::ffff:10.0.0.1" matches "10.0.0.1". */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.toLowerCase().startsWith("::ffff:") && trimmed.includes(".")
    ? trimmed.slice(7)
    : trimmed;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out = out * 256 + n;
  }
  return out;
}

/** Returns true when `ip` equals an entry or falls inside an IPv4 CIDR entry. */
export function isIpWhitelisted(ip: string, whitelist: string[]): boolean {
  const candidate = normalizeIp(ip);
  for (const raw of whitelist) {
    const entry = normalizeIp(raw);
    if (!entry) continue;

    if (!entry.includes("/")) {
      if (entry.toLowerCase() === candidate.toLowerCase()) return true;
      continue;
    }

    const [base, bitsRaw] = entry.split("/");
    const bits = Number(bitsRaw);
    const baseInt = ipv4ToInt(base);
    const ipInt = ipv4ToInt(candidate);
    if (baseInt === null || ipInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      continue;
    }
    if (bits === 0) return true;
    const block = 2 ** (32 - bits);
    if (Math.floor(baseInt / block) === Math.floor(ipInt / block)) return true;
  }
  return false;
}

export function parseWhitelist(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getIp(req: Request): string {
  // Express `req.ip` respects the app-level `trust proxy` setting.
  return normalizeIp(req.ip || req.socket?.remoteAddress || "unknown");
}

/**
 * Creates an IP-keyed token bucket limiter.
 *
 * @example
 * router.get("/checkout/:id", ipRateLimit({ name: "checkout", capacity: 60, refillPerSecond: 2 }), handler);
 */
export function ipRateLimit(options: IpRateLimitOptions): RequestHandler {
  const { name, envPrefix } = options;
  const env = process.env;

  const capacity = Math.floor(
    readPositiveNumber(
      envPrefix ? env[`${envPrefix}_CAPACITY`] : undefined,
      options.capacity,
      env.PUBLIC_IP_RATE_LIMIT_CAPACITY,
    ) ?? DEFAULT_CAPACITY,
  ) || 1;
  const refillPerSecond =
    readPositiveNumber(
      envPrefix ? env[`${envPrefix}_REFILL_PER_SECOND`] : undefined,
      options.refillPerSecond,
      env.PUBLIC_IP_RATE_LIMIT_REFILL_PER_SECOND,
    ) ?? DEFAULT_REFILL_PER_SECOND;
  const refillPerMs = refillPerSecond / 1000;

  // Keep the key around long enough for an empty bucket to refill completely.
  const ttlMs = Math.ceil((capacity / refillPerSecond) * 1000) + 1000;

  const whitelist = options.whitelist ?? parseWhitelist(env.RATE_LIMIT_IP_WHITELIST);
  const disabled = env.PUBLIC_IP_RATE_LIMIT_DISABLED === "true";
  const store = options.store ?? sharedRedisStore;
  const fallbackStore = options.fallbackStore ?? sharedFallbackStore;
  const now = options.now ?? Date.now;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (disabled) return next();

    const ip = getIp(req);
    if (isIpWhitelisted(ip, whitelist)) return next();

    const key = `${KEY_PREFIX}:${name}:${ip}`;
    const t = now();

    let result: TokenBucketResult;
    try {
      result = await store.take(key, capacity, refillPerMs, t, ttlMs);
    } catch {
      result = await fallbackStore.take(key, capacity, refillPerMs, t, ttlMs);
    }

    const tokens = Math.max(0, Math.min(capacity, result.tokens));
    const msUntilFull = ((capacity - tokens) / refillPerMs);
    const resetEpochSeconds = Math.ceil((t + msUntilFull) / 1000);

    res.setHeader("X-RateLimit-Limit", String(capacity));
    res.setHeader("X-RateLimit-Remaining", String(Math.floor(tokens)));
    res.setHeader("X-RateLimit-Reset", String(resetEpochSeconds));

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return sendApiError(
        res,
        apiError(429, ErrorCode.RATE_LIMIT_EXCEEDED, "Too many requests. Please slow down.", {
          retryAfterSeconds,
        }),
      );
    }

    return next();
  };
}
