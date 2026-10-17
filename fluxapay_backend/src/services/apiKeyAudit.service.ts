/**
 * Append-only audit trail for merchant API key lifecycle events (issue #1250).
 *
 * Every create / update / rotate / revoke / regenerate writes one
 * `ApiKeyAuditLog` row with the merchant, actor, action, IP address, user
 * agent, key prefix and timestamp. Rows are never updated or deleted (a
 * database trigger rejects UPDATE/DELETE), and no secret key material is ever
 * stored: only the public prefix (e.g. `sk_live_`) and the last four
 * characters, with any metadata scrubbed of key-like values.
 */

import type { Request } from "express";
import { prisma } from "../config/prisma";
import { getLogger, getMetricsCollector } from "../utils/logger";
import type { AuthRequest } from "../types/express";

const logger = getLogger("ApiKeyAudit");
const metrics = getMetricsCollector();

export type ApiKeyAuditAction = "created" | "updated" | "rotated" | "revoked" | "regenerated";
export type AuditActorType = "merchant_user" | "api_key" | "admin" | "system";

/** Who performed an action and from where. Built from the HTTP request. */
export interface AuditRequestContext {
  actorId: string;
  actorType: AuditActorType;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ApiKeyAuditInput {
  merchantId: string;
  action: ApiKeyAuditAction;
  context?: AuditRequestContext;
  apiKeyId?: string | null;
  /** Public prefix such as `sk_live_` / `sk_test_` / `fpk_test_`. */
  keyPrefix: string;
  keyLastFour?: string | null;
  environment?: string | null;
  metadata?: Record<string, unknown>;
}

const KNOWN_PREFIXES = ["sk_live_", "sk_test_", "fpk_test_", "fpk_live_"] as const;
const SECRET_VALUE = /\b(?:sk_(?:live|test)_|fpk_(?:live|test)_|whsec_)[A-Za-z0-9_-]{4,}/g;
const SECRET_KEY_NAME = /(?:^|_)(?:key|secret|token|password|hash|plaintext)$/i;
const MAX_USER_AGENT = 512;

/** Public prefix for an environment, e.g. `live` → `sk_live_`. */
export function keyPrefixForEnvironment(environment: string | null | undefined): string {
  return environment === "test" ? "sk_test_" : "sk_live_";
}

/**
 * Reduce anything that might be a full key to its public prefix. Ensures
 * callers cannot accidentally pass a plaintext key as the "prefix".
 */
export function safeKeyPrefix(value: string): string {
  const prefix = KNOWN_PREFIXES.find((p) => value.startsWith(p));
  if (prefix) return prefix;
  const underscore = value.indexOf("_");
  return underscore > 0 ? value.slice(0, Math.min(underscore + 1, 12)) : "unknown";
}

/**
 * Deep-copy `value`, replacing anything that looks like key material: values
 * matching a FluxaPay/webhook secret pattern, and fields whose name ends in
 * key/secret/token/password/hash/plaintext.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return value.replace(SECRET_VALUE, "[REDACTED]");
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_NAME.test(k) && v != null && v !== "" ? "[REDACTED]" : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Client IP: Express `req.ip` (honours `trust proxy`), else the socket. */
function clientIp(req: Request): string | null {
  const ip = req.ip || req.socket?.remoteAddress || null;
  return ip ? ip.replace(/^::ffff:/, "") : null;
}

/**
 * Build the audit context for a request. A dashboard (JWT) session is the
 * merchant user; API-key authentication is recorded as `api_key`.
 */
export function auditContextFromRequest(req: Request, fallbackActorId: string): AuditRequestContext {
  const authReq = req as AuthRequest;
  const userAgent = req.get?.("user-agent") ?? (req.headers?.["user-agent"] as string | undefined);
  if (authReq.adminUser?.id) {
    return { actorId: authReq.adminUser.id, actorType: "admin", ipAddress: clientIp(req), userAgent: userAgent ?? null };
  }
  return {
    actorId: authReq.user?.id ?? authReq.merchantId ?? fallbackActorId,
    actorType: authReq.user?.id ? "merchant_user" : "api_key",
    ipAddress: clientIp(req),
    userAgent: userAgent ?? null,
  };
}

type AuditDelegate = {
  create: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
  count: (args: unknown) => Promise<number>;
};

function delegate(): AuditDelegate | undefined {
  return (prisma as unknown as { apiKeyAuditLog?: AuditDelegate }).apiKeyAuditLog;
}

/** Build the row that would be written (exported for tests). */
export function buildAuditRecord(input: ApiKeyAuditInput) {
  const context = input.context ?? { actorId: input.merchantId, actorType: "system" as const };
  const lastFour = input.keyLastFour ? input.keyLastFour.slice(-4) : null;
  return {
    merchantId: input.merchantId,
    actor_id: context.actorId,
    actor_type: context.actorType,
    action: input.action,
    api_key_id: input.apiKeyId ?? null,
    key_prefix: safeKeyPrefix(input.keyPrefix),
    key_last_four: lastFour,
    environment: input.environment ?? null,
    ip_address: context.ipAddress ?? null,
    user_agent: context.userAgent ? context.userAgent.slice(0, MAX_USER_AGENT) : null,
    metadata: (redactSecrets(input.metadata ?? {}) as object) ?? {},
  };
}

/**
 * Write one audit row. Audit failures are logged loudly and counted, but do
 * not undo the key operation the merchant already completed.
 */
export async function recordApiKeyEvent(input: ApiKeyAuditInput): Promise<boolean> {
  const data = buildAuditRecord(input);
  try {
    const model = delegate();
    if (!model) throw new Error("apiKeyAuditLog model unavailable");
    await model.create({ data });
    metrics.increment("api_key.audit.recorded", { action: input.action });
    return true;
  } catch (error) {
    metrics.increment("api_key.audit.failed", { action: input.action });
    logger.error("Failed to write API key audit log", {
      merchantId: input.merchantId,
      action: input.action,
      apiKeyId: input.apiKeyId ?? undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  action?: ApiKeyAuditAction;
  apiKeyId?: string;
  from?: Date;
  to?: Date;
}

/** Read a merchant's audit trail, newest first. */
export async function listApiKeyAuditLogs(merchantId: string, query: AuditLogQuery = {}) {
  const model = delegate();
  if (!model) throw new Error("apiKeyAuditLog model unavailable");
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const where: Record<string, unknown> = { merchantId };
  if (query.action) where.action = query.action;
  if (query.apiKeyId) where.api_key_id = query.apiKeyId;
  if (query.from || query.to) {
    where.created_at = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    model.findMany({ where, orderBy: { created_at: "desc" }, skip: (page - 1) * limit, take: limit }),
    model.count({ where }),
  ]);
  return {
    data: rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}
