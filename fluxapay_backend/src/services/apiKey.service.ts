/**
 * apiKey.service.ts
 *
 * Merchant API key management service.
 *
 * Features:
 *  - Create API keys (live/test) with SHA-256 hashing
 *  - Rotate API keys (generate new key, revoke old)
 *  - Return plaintext key only once at creation
 *  - List keys (masked, with last 4 chars)
 *  - Revoke keys
 *  - Update last_used_at on authentication
 *  - Rate limit key creation (10 per hour per merchant)
 *  - Max 5 active keys per merchant
 *  - Audit logging for create/revoke operations
 */

import { PrismaClient, Prisma } from "../generated/client/client";
import crypto from "crypto";
import { AuditActionType, AuditEntityType } from "../types/audit.types";

import { prisma } from "../config/prisma";

/** Maximum active keys per merchant */
const MAX_ACTIVE_KEYS = 5;

/** Rate limit: keys created per hour per merchant */
const KEYS_PER_HOUR_LIMIT = 10;

/** Key prefix for live environment */
const LIVE_PREFIX = "fpk_live_";

/** Key prefix for test environment */
const TEST_PREFIX = "fpk_test_";

/** Random key length (excluding prefix) */
const KEY_LENGTH = 32;

/** Grace period (ms) during which a rotated key remains valid */
const ROTATION_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

/** Default expiry window for new merchant API keys (365 days). */
export const DEFAULT_API_KEY_EXPIRY_DAYS = 365;
export const API_KEY_EXPIRY_OPTIONS = [90, 180, 365] as const;

export function normalizeApiKeyExpiryDays(expiryDays?: number | string | null): number {
  if (expiryDays === undefined || expiryDays === null || expiryDays === "") {
    return DEFAULT_API_KEY_EXPIRY_DAYS;
  }

  const parsed = Number(expiryDays);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("API key expiration must be a positive number of days");
  }

  return parsed;
}

/**
 * Create audit log entry for API key operations
 */
async function createAuditLog(
  params: {
    admin_id: string;
    action_type: AuditActionType;
    entity_type: AuditEntityType;
    entity_id: string;
    details: any;
  },
  tx?: Prisma.TransactionClient,
): Promise<any | null> {
  const client = tx || prisma;

  try {
    const auditLog = await client.auditLog.create({
      data: {
        admin_id: params.admin_id,
        action_type: params.action_type,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        details: params.details,
      },
    });

    console.log(`[Audit] ${params.action_type} on ${params.entity_type}:${params.entity_id}`);
    return auditLog;
  } catch (error) {
    console.error(`[Audit] Failed to log ${params.action_type}:`, error);
    return null;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateApiKeyResult {
  id: string;
  name: string;
  key: string; // Plaintext key (only returned once)
  environment: "live" | "test";
  last_four: string;
  created_at: Date;
  expires_at: Date | null;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  last_four: string;
  prefix: "sk" | "fpk";
  environment: "live" | "test";
  status: "active" | "revoked";
  last_used_at: Date | null;
  created_at: Date;
  expires_at: Date | null;
}

export interface RotateApiKeyResult {
  id: string;
  name: string;
  key: string; // New plaintext key (only returned once)
  environment: "live" | "test";
  last_four: string;
  created_at: Date;
  rotated_from_id: string;
  previous_key_expires_at: Date;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ApiKeyService {
  /**
   * Generate a random API key.
   */
  private generateKey(environment: "live" | "test"): string {
    const prefix = environment === "live" ? LIVE_PREFIX : TEST_PREFIX;
    const randomBytes = crypto.randomBytes(KEY_LENGTH);
    const randomString = randomBytes.toString("base64url").slice(0, KEY_LENGTH);
    return `${prefix}${randomString}`;
  }

  /**
   * Hash an API key using SHA-256.
   */
  private hashKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  /**
   * Extract last 4 characters of a key.
   */
  private getLastFour(key: string): string {
    return key.slice(-4);
  }

  /**
   * Check if merchant has exceeded rate limit for key creation.
   */
  private async checkRateLimit(merchantId: string): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const count = await (prisma as any).apiKey.count({
      where: {
        merchantId,
        created_at: { gte: oneHourAgo },
      },
    });

    return count < KEYS_PER_HOUR_LIMIT;
  }

  /**
   * Check if merchant has reached maximum active keys.
   */
  private async checkMaxActiveKeys(merchantId: string): Promise<boolean> {
    const now = new Date();
    const count = await (prisma as any).apiKey.count({
      where: {
        merchantId,
        status: "active",
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
    });

    return count < MAX_ACTIVE_KEYS;
  }

  /**
   * Create a new API key for a merchant.
   *
   * Returns the plaintext key only once. Subsequent reads show only masked value.
   */
  async createApiKey(
    merchantId: string,
    name: string,
    environment: "live" | "test",
    actor: string,
    expiryDays?: number | string,
  ): Promise<CreateApiKeyResult> {
    const resolvedExpiryDays = normalizeApiKeyExpiryDays(expiryDays);
    const expiresAt = new Date(Date.now() + resolvedExpiryDays * 24 * 60 * 60 * 1000);

    // Rate limit check
    const withinRateLimit = await this.checkRateLimit(merchantId);
    if (!withinRateLimit) {
      throw new Error(`Rate limit exceeded: maximum ${KEYS_PER_HOUR_LIMIT} keys per hour`);
    }

    // Max active keys check
    const withinMaxKeys = await this.checkMaxActiveKeys(merchantId);
    if (!withinMaxKeys) {
      throw new Error(`Maximum active keys limit reached: ${MAX_ACTIVE_KEYS}`);
    }

    // Generate key
    const plaintextKey = this.generateKey(environment);
    const keyHash = this.hashKey(plaintextKey);
    const lastFour = this.getLastFour(plaintextKey);

    // Create database record
    const apiKey = await (prisma as any).apiKey.create({
      data: {
        merchantId,
        name,
        key_hash: keyHash,
        key_last_four: lastFour,
        environment: environment === "live" ? "live" : "test",
        status: "active",
        expires_at: expiresAt,
      },
    });

    // Log audit event
    await createAuditLog({
      admin_id: actor,
      action_type: "api_key_created" as AuditActionType,
      entity_type: "api_key" as AuditEntityType,
      entity_id: apiKey.id,
      details: {
        merchantId,
        keyName: name,
        environment,
        lastFour,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: plaintextKey, // Return plaintext only once
      environment: apiKey.environment as "live" | "test",
      last_four: apiKey.key_last_four,
      created_at: apiKey.created_at,
      expires_at: expiresAt,
    };
  }

  /**
   * List API keys for a merchant.
   *
   * Returns masked keys (only last 4 chars visible).
   */
  async listApiKeys(merchantId: string): Promise<ApiKeyDto[]> {
    const apiKeys = await (prisma as any).apiKey.findMany({
      where: {
        merchantId,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return apiKeys.map((key: any) => ({
      id: key.id,
      name: key.name,
      last_four: key.key_last_four,
      prefix: key.key_hash.startsWith("$2") ? "sk" : "fpk",
      environment: key.environment as "live" | "test",
      status: key.status as "active" | "revoked",
      last_used_at: key.last_used_at,
      created_at: key.created_at,
      expires_at: key.expires_at,
    }));
  }

  /**
   * Rotate an API key.
   *
   * Generates a new key with the same name and environment, revokes the old key
   * after a grace period, and returns the new plaintext key only once.
   */
  async rotateApiKey(
    merchantId: string,
    keyId: string,
    actor: string,
  ): Promise<RotateApiKeyResult> {
    const existingKey = await (prisma as any).apiKey.findFirst({
      where: {
        id: keyId,
        merchantId,
      },
    });

    if (!existingKey) {
      throw new Error("API key not found");
    }

    if (existingKey.status === "revoked") {
      throw new Error("Cannot rotate a revoked API key");
    }

    // Rate limit check
    const withinRateLimit = await this.checkRateLimit(merchantId);
    if (!withinRateLimit) {
      throw new Error(`Rate limit exceeded: maximum ${KEYS_PER_HOUR_LIMIT} keys per hour`);
    }

    // Max active keys check (rotation temporarily adds one key)
    const withinMaxKeys = await this.checkMaxActiveKeys(merchantId);
    if (!withinMaxKeys) {
      throw new Error(`Maximum active keys limit reached: ${MAX_ACTIVE_KEYS}`);
    }

    const environment = existingKey.environment as "live" | "test";
    const plaintextKey = this.generateKey(environment);
    const keyHash = this.hashKey(plaintextKey);
    const lastFour = this.getLastFour(plaintextKey);
    const previousKeyExpiresAt = new Date(Date.now() + ROTATION_GRACE_PERIOD_MS);

    const newKey = await (prisma as any).$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await (tx as any).apiKey.create({
        data: {
          merchantId,
          name: existingKey.name,
          key_hash: keyHash,
          key_last_four: lastFour,
          environment,
          status: "active",
        },
      });

      await (tx as any).apiKey.update({
        where: { id: keyId },
        data: {
          status: "revoked",
          expires_at: previousKeyExpiresAt,
        },
      });

      return created;
    });

    // Log audit event
    await createAuditLog({
      admin_id: actor,
      action_type: "api_key_rotated" as AuditActionType,
      entity_type: "api_key" as AuditEntityType,
      entity_id: newKey.id,
      details: {
        merchantId,
        keyName: existingKey.name,
        environment,
        lastFour,
        rotatedFromId: keyId,
        previousKeyExpiresAt,
      },
    });

    return {
      id: newKey.id,
      name: newKey.name,
      key: plaintextKey,
      environment: newKey.environment as "live" | "test",
      last_four: newKey.key_last_four,
      created_at: newKey.created_at,
      rotated_from_id: keyId,
      previous_key_expires_at: previousKeyExpiresAt,
    };
  }

  /**
   * Revoke an API key.
   *
   * In-flight requests using this key will complete, but new requests will be rejected.
   */
  async revokeApiKey(
    merchantId: string,
    keyId: string,
    actor: string,
  ): Promise<void> {
    const apiKey = await (prisma as any).apiKey.findFirst({
      where: {
        id: keyId,
        merchantId,
      },
    });

    if (!apiKey) {
      throw new Error("API key not found");
    }

    if (apiKey.status === "revoked") {
      throw new Error("API key is already revoked");
    }

    await (prisma as any).apiKey.update({
      where: { id: keyId },
      data: {
        status: "revoked",
      },
    });

    // Log audit event
    await createAuditLog({
      admin_id: actor,
      action_type: "api_key_revoked" as AuditActionType,
      entity_type: "api_key" as AuditEntityType,
      entity_id: keyId,
      details: {
        merchantId,
        keyName: apiKey.name,
        environment: apiKey.environment,
        lastFour: apiKey.key_last_four,
      },
    });
  }

  /**
   * Validate an API key by hash and update last_used_at.
   *
   * Called during authentication.
   */
  async validateAndUpdateUsage(keyHash: string): Promise<{ valid: boolean; merchantId?: string; expired?: boolean }> {
    const now = new Date();
    const apiKey = await (prisma as any).apiKey.findUnique({
      where: {
        key_hash: keyHash,
      },
    });

    if (!apiKey) {
      return { valid: false };
    }

    if (apiKey.status !== "active" || (apiKey.expires_at && apiKey.expires_at <= now)) {
      if (apiKey.expires_at && apiKey.expires_at <= now) {
        await (prisma as any).apiKey.update({
          where: { id: apiKey.id },
          data: { status: "revoked" },
        }).catch(() => undefined);
        return { valid: false, merchantId: apiKey.merchantId, expired: true };
      }
      return { valid: false };
    }

    const updated = await (prisma as any).apiKey.updateMany({
      where: {
        id: apiKey.id,
        status: "active",
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      data: {
        last_used_at: new Date(),
      },
    });

    if (updated.count !== 1) {
      return { valid: false };
    }

    return {
      valid: true,
      merchantId: apiKey.merchantId,
    };
  }

  private async markKeyExpired(keyId: string, merchantId?: string): Promise<void> {
    const apiKeyClient = (prisma as any).apiKey;
    if (!apiKeyClient || typeof apiKeyClient.update !== "function") {
      return;
    }

    await apiKeyClient.update({
      where: { id: keyId },
      data: { status: "revoked" },
    }).catch(() => undefined);
  }

  /** Validate a raw API key, supporting both modern SHA-256 and legacy bcrypt hashes. */
  async validateRawApiKey(key: string): Promise<{ valid: boolean; merchantId?: string; expired?: boolean }> {
    const now = new Date();
    const candidates = await (prisma as any).apiKey.findMany({
      where: {
        key_last_four: this.getLastFour(key),
        status: "active",
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
    });
    const keyHash = this.hashKey(key);

    for (const candidate of candidates) {
      const matches = candidate.key_hash.startsWith("$2")
        ? await import("../helpers/crypto.helper").then(({ compareKeys }) => compareKeys(key, candidate.key_hash))
        : candidate.key_hash === keyHash;

      if (!matches) {
        continue;
      }

      if (candidate.expires_at && candidate.expires_at <= now) {
        await this.markKeyExpired(candidate.id, candidate.merchantId);
        return { valid: false, merchantId: candidate.merchantId, expired: true };
      }

      const updated = await (prisma as any).apiKey.updateMany({
        where: {
          id: candidate.id,
          status: "active",
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
        data: { last_used_at: new Date() },
      });

      if (updated.count === 1) {
        return { valid: true, merchantId: candidate.merchantId };
      }
    }

    return { valid: false };
  }

  async validateRotatedApiKey(key: string): Promise<{ valid: boolean; merchantId?: string; expired?: boolean }> {
    const now = new Date();
    const candidates = await (prisma as any).apiKey.findMany({
      where: {
        key_last_four: this.getLastFour(key),
        status: { in: ["active", "rotated"] },
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
    });
    const keyHash = this.hashKey(key);

    for (const candidate of candidates) {
      const matches = candidate.key_hash.startsWith("$2")
        ? await import("../helpers/crypto.helper").then(({ compareKeys }) => compareKeys(key, candidate.key_hash))
        : candidate.key_hash === keyHash;

      if (!matches) {
        continue;
      }

      if (candidate.expires_at && candidate.expires_at <= now) {
        await this.markKeyExpired(candidate.id, candidate.merchantId);
        return { valid: false, merchantId: candidate.merchantId, expired: true };
      }

      return { valid: true, merchantId: candidate.merchantId };
    }

    return { valid: false };
  }

  async runApiKeyExpiryWarningJob(): Promise<{ processed: number; notified: number; warnings: Array<{ merchantId: string; keyId: string; expires_at: string; days_remaining: number; window: "7d" | "30d" }> }> {
    const now = new Date();
    const threshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const apiKeys = await (prisma as any).apiKey.findMany({
      where: {
        status: "active",
        expires_at: {
          not: null,
          gte: now,
          lte: threshold,
        },
      },
      include: {
        merchant: {
          select: {
            id: true,
            email: true,
            business_name: true,
          },
        },
      },
    });

    const warnings: Array<{ merchantId: string; keyId: string; expires_at: string; days_remaining: number; window: "7d" | "30d" }> = [];
    let notified = 0;

    for (const apiKey of apiKeys) {
      const merchant = apiKey.merchant;
      if (!merchant?.email) {
        continue;
      }

      const expiresAt = new Date(apiKey.expires_at);
      const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      const window = daysRemaining <= 7 ? "7d" : "30d";

      try {
        const { sendApiKeyExpirationWarningEmail } = await import("./email.service");
        await sendApiKeyExpirationWarningEmail(
          merchant.email,
          merchant.business_name || "Merchant",
          {
            key_id: apiKey.id,
            key_name: apiKey.name,
            expires_at: expiresAt.toISOString(),
            days_remaining: daysRemaining,
            severity: "warning",
            window,
          },
        );
        notified += 1;
      } catch (error) {
        console.error("API key expiry warning email failed:", error);
      }

      warnings.push({
        merchantId: merchant.id,
        keyId: apiKey.id,
        expires_at: expiresAt.toISOString(),
        days_remaining: daysRemaining,
        window,
      });
    }

    return {
      processed: apiKeys.length,
      notified,
      warnings,
    };
  }

  /**
   * Get an API key by hash (for authentication).
   */
  async getApiKeyByHash(keyHash: string) {
    return (prisma as any).apiKey.findUnique({
      where: {
        key_hash: keyHash,
      },
      include: {
        merchant: true,
      },
    });
  }
}

export const apiKeyService = new ApiKeyService();
