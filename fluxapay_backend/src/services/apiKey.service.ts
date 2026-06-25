/**
 * apiKey.service.ts
 *
 * Merchant API key management service.
 *
 * Features:
 *  - Create API keys (live/test) with SHA-256 hashing
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

const prisma = new PrismaClient();

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
}

export interface ApiKeyDto {
  id: string;
  name: string;
  last_four: string;
  environment: "live" | "test";
  status: "active" | "revoked";
  last_used_at: Date | null;
  created_at: Date;
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
    const count = await (prisma as any).apiKey.count({
      where: {
        merchantId,
        status: "active",
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
  ): Promise<CreateApiKeyResult> {
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
      environment: key.environment as "live" | "test",
      status: key.status as "active" | "revoked",
      last_used_at: key.last_used_at,
      created_at: key.created_at,
    }));
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
  async validateAndUpdateUsage(keyHash: string): Promise<{ valid: boolean; merchantId?: string }> {
    const apiKey = await (prisma as any).apiKey.findUnique({
      where: {
        key_hash: keyHash,
      },
    });

    if (!apiKey) {
      return { valid: false };
    }

    if (apiKey.status === "revoked") {
      return { valid: false };
    }

    // Update last_used_at
    await (prisma as any).apiKey.update({
      where: { id: apiKey.id },
      data: {
        last_used_at: new Date(),
      },
    });

    return {
      valid: true,
      merchantId: apiKey.merchantId,
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
