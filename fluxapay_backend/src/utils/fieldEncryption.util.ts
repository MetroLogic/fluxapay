/**
 * Application-level encryption for sensitive fields at rest (issue #1249).
 *
 * AES-256-GCM with a random 96-bit IV per value; output is
 * `v1:<iv b64>:<tag b64>:<ciphertext b64>`. A separate HMAC-SHA256 key
 * produces deterministic fingerprints for duplicate detection without
 * decrypting anything.
 *
 * Key material: `PAYOUT_ENCRYPTION_KEY` (32 bytes as 64 hex chars or base64).
 * Outside production, a key is derived from `KMS_ENCRYPTION_PASSPHRASE` /
 * `JWT_SECRET` so local development works; production refuses to start
 * encrypting without an explicit key.
 */

import crypto from "crypto";

const VERSION = "v1";
let cachedKey: Buffer | null = null;

function decodeKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex");
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

/** Resolve the 32-byte master key. Exported for tests via `resetEncryptionKeyCache`. */
export function getEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  if (cachedKey) return cachedKey;
  const explicit = env.PAYOUT_ENCRYPTION_KEY;
  if (explicit) {
    const key = decodeKey(explicit);
    if (!key) throw new Error("PAYOUT_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)");
    cachedKey = key;
    return key;
  }
  if (env.NODE_ENV === "production") {
    throw new Error("PAYOUT_ENCRYPTION_KEY is required in production to store payout account details");
  }
  const seed = env.KMS_ENCRYPTION_PASSPHRASE || env.JWT_SECRET || "fluxapay-dev-only-payout-key";
  cachedKey = crypto.createHash("sha256").update(`payout-field-encryption:${seed}`).digest();
  return cachedKey;
}

export function resetEncryptionKeyCache(): void {
  cachedKey = null;
}

/** Sub-key for a purpose, so encryption and fingerprinting never share a key. */
function subKey(purpose: string): Buffer {
  return crypto.createHmac("sha256", getEncryptionKey()).update(purpose).digest();
}

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", subKey("encrypt"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptField(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error("Unsupported encrypted field format");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", subKey("encrypt"), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Deterministic, keyed fingerprint (hex) of `parts` for equality checks. */
export function fingerprint(...parts: string[]): string {
  return crypto.createHmac("sha256", subKey("fingerprint")).update(parts.join("\u001f")).digest("hex");
}

/** `******1234` style mask showing only the last `visible` characters. */
export function maskValue(value: string, visible = 4): string {
  const tail = value.slice(-visible);
  return `${"*".repeat(Math.max(4, value.length - visible))}${tail}`;
}
