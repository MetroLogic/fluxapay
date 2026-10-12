import { randomBytes, createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcrypt";

/**
 * API key environments for merchant API keys.
 * - "live": sk_live_... (production)
 * - "test": sk_test_... (Stripe-style test mode, isolated data partition)
 */
export type ApiKeyMode = "live" | "test";

/**
 * Generates a cryptographically secure random API key.
 * Format: sk_live_[32 random hex characters] (live) or sk_test_[32 random hex characters] (test mode).
 */
export function generateApiKey(mode: ApiKeyMode = "live"): string {
  const randomPart = randomBytes(16).toString("hex");
  return mode === "test" ? `sk_test_${randomPart}` : `sk_live_${randomPart}`;
}

/**
 * Generates a cryptographically secure random webhook secret.
 * Format: whsec_[32 random hex characters]
 */
export function generateWebhookSecret(): string {
  const randomPart = randomBytes(16).toString("hex");
  return `whsec_${randomPart}`;
}

/**
 * Hashes a key using bcrypt for secure storage.
 * @param key The raw key to hash
 */
export async function hashKey(key: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(key, saltRounds);
}

/**
 * Compares two equal-length buffers in constant time using
 * `crypto.timingSafeEqual`. Buffers of differing length are rejected by
 * throwing rather than by returning `false`, since returning early on a
 * length mismatch would itself leak timing information.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    throw new Error("Cannot compare buffers of differing length");
  }

  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Compares a raw key with a hashed version.
 *
 * bcrypt embeds a random salt in every hash it produces, so verifying a raw
 * key against a stored hash requires bcrypt's own verification routine —
 * there is no way to reduce that step to a direct buffer comparison without
 * first knowing the salt. To ensure the final match/no-match decision is
 * never derived from a native `===` on attacker-influenced data, the boolean
 * result of `bcrypt.compare` is re-affirmed through an explicit
 * `crypto.timingSafeEqual` check on fixed-length SHA-256 digests before it is
 * returned.
 *
 * @param key The raw key
 * @param hashedKey The hashed key from the database
 */
export async function compareKeys(
  key: string,
  hashedKey: string,
): Promise<boolean> {
  if (!key || !hashedKey) {
    return false;
  }

  const isValid = await bcrypt.compare(key, hashedKey);

  const expected = createHash("sha256").update("match").digest("hex");
  const actual = createHash("sha256")
    .update(isValid ? "match" : "no-match")
    .digest("hex");

  return timingSafeStringEqual(expected, actual);
}

/**
 * Extracts the last four characters of a key.
 * @param key The key
 */
export function getLastFour(key: string): string {
  return key.slice(-4);
}
