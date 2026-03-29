import { randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";

/**
 * Generates a cryptographically secure random API key.
 * Format: sk_live_[32 random hex characters]
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(16).toString("hex");
  return `sk_live_${randomPart}`;
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
 * Compares a raw key with a hashed version.
 * @param key The raw key
 * @param hashedKey The hashed key from the database
 */
export async function compareKeys(
  key: string,
  hashedKey: string,
): Promise<boolean> {
  return bcrypt.compare(key, hashedKey);
}

/**
 * Extracts the last four characters of a key.
 * @param key The key
 */
export function getLastFour(key: string): string {
  return key.slice(-4);
}
