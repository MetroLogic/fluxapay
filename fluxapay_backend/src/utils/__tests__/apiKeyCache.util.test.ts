jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  sadd: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  smembers: jest.fn(),
};

import {
  API_KEY_CACHE_TTL_SECONDS,
  buildApiKeyCacheKey,
  getCachedApiKeyLookup,
  setCachedApiKeyLookup,
} from "../apiKeyCache.util";
import crypto from "crypto";

describe("API-key Redis cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    delete process.env.REDIS_URL;
  });

  it("uses a SHA-256 digest instead of storing the raw API key in the Redis key", () => {
    const rawKey = "fpk_live_private-key-value";
    const expectedDigest = crypto.createHash("sha256").update(rawKey).digest("hex");

    expect(buildApiKeyCacheKey(rawKey)).toBe(`api_key_auth:${expectedDigest}`);
    expect(buildApiKeyCacheKey(rawKey)).not.toContain(rawKey);
  });

  it("caches valid lookup results for ten minutes", async () => {
    await setCachedApiKeyLookup("fpk_test_key", "merchant_1", true);

    expect(mockRedis.set).toHaveBeenCalledWith(
      buildApiKeyCacheKey("fpk_test_key"),
      JSON.stringify({ merchantId: "merchant_1", isTestMode: true }),
      "EX",
      API_KEY_CACHE_TTL_SECONDS,
    );
    expect(mockRedis.sadd).toHaveBeenCalledWith(
      "api_key_auth_merchant:merchant_1",
      buildApiKeyCacheKey("fpk_test_key"),
    );
    expect(mockRedis.expire).toHaveBeenCalledWith(
      "api_key_auth_merchant:merchant_1",
      API_KEY_CACHE_TTL_SECONDS,
    );
    expect(API_KEY_CACHE_TTL_SECONDS).toBe(600);
  });

  it("invalidates all cached keys indexed for a merchant", async () => {
    mockRedis.smembers.mockResolvedValueOnce(["api_key_auth:old-hash", "api_key_auth:new-hash"]);
    const { invalidateApiKeyCacheForMerchant } = await import("../apiKeyCache.util");

    await invalidateApiKeyCacheForMerchant("merchant_1");

    expect(mockRedis.del).toHaveBeenCalledWith(
      "api_key_auth:old-hash",
      "api_key_auth:new-hash",
      "api_key_auth_merchant:merchant_1",
    );
  });

  it("returns cached lookup results and falls back on Redis failure", async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ merchantId: "merchant_1", isTestMode: false }),
    );
    await expect(getCachedApiKeyLookup("fpk_live_key")).resolves.toEqual({
      merchantId: "merchant_1",
      isTestMode: false,
    });

    mockRedis.get.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(getCachedApiKeyLookup("fpk_live_key")).resolves.toBeNull();
  });
});