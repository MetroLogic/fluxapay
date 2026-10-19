import crypto from "crypto";
import Redis from "ioredis";

export const API_KEY_CACHE_TTL_SECONDS = 600;
const API_KEY_CACHE_PREFIX = "api_key_auth:";
const API_KEY_CACHE_MERCHANT_INDEX_PREFIX = "api_key_auth_merchant:";

let sharedRedisClient: Redis | null = null;

export function getApiKeyCacheClient(): Redis | null {
  if (typeof process === "undefined" || !process.env.REDIS_URL) {
    return null;
  }

  if (!sharedRedisClient) {
    sharedRedisClient = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  return sharedRedisClient;
}

export function buildApiKeyCacheKey(rawKey: string): string {
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  return `${API_KEY_CACHE_PREFIX}${keyHash}`;
}

export type ApiKeyCachePayload = {
  merchantId: string;
  isTestMode: boolean;
};

export async function getCachedApiKeyLookup(
  rawKey: string,
): Promise<ApiKeyCachePayload | null> {
  try {
    const client = getApiKeyCacheClient();
    if (!client) {
      return null;
    }

    const value = await client.get(buildApiKeyCacheKey(rawKey));
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as Partial<ApiKeyCachePayload>;
    if (!parsed.merchantId) {
      return null;
    }

    return {
      merchantId: parsed.merchantId,
      isTestMode: Boolean(parsed.isTestMode),
    };
  } catch {
    return null;
  }
}

export async function setCachedApiKeyLookup(
  rawKey: string,
  merchantId: string,
  isTestMode: boolean,
): Promise<void> {
  try {
    const client = getApiKeyCacheClient();
    if (!client) {
      return;
    }

    await client.set(
      buildApiKeyCacheKey(rawKey),
      JSON.stringify({ merchantId, isTestMode }),
      "EX",
      API_KEY_CACHE_TTL_SECONDS,
    );
    const merchantIndex = `${API_KEY_CACHE_MERCHANT_INDEX_PREFIX}${merchantId}`;
    await client.sadd(merchantIndex, buildApiKeyCacheKey(rawKey));
    await client.expire(merchantIndex, API_KEY_CACHE_TTL_SECONDS);
  } catch {
    // Ignore Redis failures and use the database as the source of truth.
  }
}

export async function invalidateApiKeyCache(rawKey: string): Promise<void> {
  try {
    const client = getApiKeyCacheClient();
    if (!client) {
      return;
    }

    await client.del(buildApiKeyCacheKey(rawKey));
  } catch {
    // Ignore Redis failures; fallback to database lookup continues to work.
  }
}

export async function invalidateApiKeyCacheForMerchant(merchantId: string): Promise<void> {
  try {
    const client = getApiKeyCacheClient();
    if (!client || !merchantId) {
      return;
    }

    const merchantIndex = `${API_KEY_CACHE_MERCHANT_INDEX_PREFIX}${merchantId}`;
    const keys = await client.smembers(merchantIndex);
    if (!keys.length) {
      return;
    }
    await client.del(...keys, merchantIndex);
  } catch {
    // Ignore Redis failures; auth will still continue with database validation.
  }
}
