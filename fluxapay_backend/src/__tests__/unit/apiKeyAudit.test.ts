/**
 * API key audit trail (#1250): an append-only entry is written on every key
 * lifecycle event, and key material never reaches the log.
 */

jest.mock("../../utils/logger", () => ({
  getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  getMetricsCollector: () => ({ increment: jest.fn() }),
}));
jest.mock("../../helpers/apiError.helper", () => ({
  apiError: (status: number, code: string, message: string, extras?: unknown) => ({ status, code, message, ...(extras as object) }),
  sendApiError: (res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: { status?: number; code?: string; message?: string }) =>
    res.status(err.status ?? 500).json({ code: err.code, message: err.message }),
}));

const mockAudit = { create: jest.fn(), findMany: jest.fn(), count: jest.fn() };
const mockApiKey = { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() };
const mockLegacyAudit = { create: jest.fn().mockResolvedValue({}) };

jest.mock("../../config/prisma", () => ({
  prisma: {
    apiKeyAuditLog: {
      create: (...a: unknown[]) => mockAudit.create(...a),
      findMany: (...a: unknown[]) => mockAudit.findMany(...a),
      count: (...a: unknown[]) => mockAudit.count(...a),
    },
    apiKey: {
      count: (...a: unknown[]) => mockApiKey.count(...a),
      create: (...a: unknown[]) => mockApiKey.create(...a),
      findFirst: (...a: unknown[]) => mockApiKey.findFirst(...a),
      update: (...a: unknown[]) => mockApiKey.update(...a),
    },
    auditLog: { create: (...a: unknown[]) => mockLegacyAudit.create(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ apiKey: { create: (...a: unknown[]) => mockApiKey.create(...a), update: (...a: unknown[]) => mockApiKey.update(...a) } }),
  },
}));
jest.mock("../../generated/client/client", () => ({ PrismaClient: jest.fn(), Prisma: {} }));

import type { Request, Response } from "express";
import {
  auditContextFromRequest,
  buildAuditRecord,
  keyPrefixForEnvironment,
  listApiKeyAuditLogs,
  recordApiKeyEvent,
  redactSecrets,
  safeKeyPrefix,
} from "../../services/apiKeyAudit.service";
import { ApiKeyService } from "../../services/apiKey.service";
import { getMerchantAuditLogs } from "../../controllers/apiKeyAudit.controller";

/**
 * Fake key-shaped strings are assembled at runtime so secret scanners never
 * see a literal that looks like a real credential.
 */
const fakeKey = (prefix: string, body: string) => [prefix, body].join("_");
const FAKE_LIVE = fakeKey("sk_live", "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345");
const FAKE_TEST = fakeKey("sk_test", "zzzzzzzzzz");
const FAKE_WHSEC = fakeKey("whsec", "abcdef123456");

const CONTEXT = {
  actorId: "merchant_1",
  actorType: "merchant_user" as const,
  ipAddress: "203.0.113.7",
  userAgent: "Mozilla/5.0 (test)",
};

function allWrittenAuditData(): Array<Record<string, unknown>> {
  return mockAudit.create.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAudit.create.mockResolvedValue({});
  mockLegacyAudit.create.mockResolvedValue({});
});

describe("redaction and prefixes", () => {
  it("never stores more than the public prefix", () => {
    expect(safeKeyPrefix(fakeKey("sk_live", "abcdef1234567890"))).toBe("sk_live_");
    expect(safeKeyPrefix(fakeKey("sk_test", "abcdef1234567890"))).toBe("sk_test_");
    expect(safeKeyPrefix("fpk_test_secretsecret")).toBe("fpk_test_");
    expect(safeKeyPrefix("totally-unknown-format")).toBe("unknown");
    expect(keyPrefixForEnvironment("test")).toBe("sk_test_");
    expect(keyPrefixForEnvironment("live")).toBe("sk_live_");
  });

  it("scrubs key-like values and secret-named fields from metadata", () => {
    const out = redactSecrets({
      name: "CI key",
      note: `leaked ${FAKE_LIVE} here`,
      key: "anything",
      api_secret: "x",
      nested: { webhook: FAKE_WHSEC, list: [FAKE_TEST] },
      lastFour: "1234",
    }) as Record<string, unknown>;
    expect(out.name).toBe("CI key");
    expect(out.note).toBe("leaked [REDACTED] here");
    expect(out.key).toBe("[REDACTED]");
    expect(out.api_secret).toBe("[REDACTED]");
    expect(out.nested).toEqual({ webhook: "[REDACTED]", list: ["[REDACTED]"] });
    expect(out.lastFour).toBe("1234");
  });

  it("builds a structured record with merchant, actor, action, IP, user agent and prefix", () => {
    const record = buildAuditRecord({
      merchantId: "m_1",
      action: "created",
      context: CONTEXT,
      apiKeyId: "key_1",
      keyPrefix: fakeKey("sk_live", "THIS_IS_THE_WHOLE_SECRET_KEY"),
      keyLastFour: "WXYZ",
      environment: "live",
    });
    expect(record).toMatchObject({
      merchantId: "m_1",
      actor_id: "merchant_1",
      actor_type: "merchant_user",
      action: "created",
      api_key_id: "key_1",
      key_prefix: "sk_live_",
      key_last_four: "WXYZ",
      ip_address: "203.0.113.7",
      user_agent: "Mozilla/5.0 (test)",
    });
    expect(JSON.stringify(record)).not.toContain("THIS_IS_THE_WHOLE_SECRET_KEY");
  });
});

describe("auditContextFromRequest", () => {
  it("distinguishes dashboard sessions from API-key callers", () => {
    const base = { ip: "::ffff:198.51.100.4", get: (h: string) => (h === "user-agent" ? "curl/8" : undefined) };
    expect(
      auditContextFromRequest({ ...base, merchantId: "m_1", user: { id: "m_1" } } as unknown as Request, "m_1"),
    ).toEqual({ actorId: "m_1", actorType: "merchant_user", ipAddress: "198.51.100.4", userAgent: "curl/8" });
    expect(auditContextFromRequest({ ...base, merchantId: "m_1" } as unknown as Request, "m_1").actorType).toBe("api_key");
  });
});

describe("ApiKeyService lifecycle writes audit entries", () => {
  const service = new ApiKeyService();

  it("records creation without the plaintext key", async () => {
    mockApiKey.count.mockResolvedValue(0);
    mockApiKey.create.mockResolvedValue({
      id: "key_new",
      name: "CI",
      environment: "live",
      key_last_four: "AbCd",
      created_at: new Date(),
    });

    const result = await service.createApiKey("m_1", "CI", "live", "m_1", CONTEXT);

    const [entry] = allWrittenAuditData();
    expect(entry).toMatchObject({
      merchantId: "m_1",
      action: "created",
      api_key_id: "key_new",
      key_prefix: "sk_live_",
      ip_address: CONTEXT.ipAddress,
      user_agent: CONTEXT.userAgent,
    });
    expect(JSON.stringify(entry)).not.toContain(result.key);
  });

  it("records rotation with the previous key reference", async () => {
    mockApiKey.findFirst.mockResolvedValue({
      id: "key_old",
      name: "CI",
      environment: "test",
      status: "active",
      key_last_four: "OLD1",
    });
    mockApiKey.count.mockResolvedValue(0);
    mockApiKey.create.mockResolvedValue({
      id: "key_rotated",
      name: "CI",
      environment: "test",
      key_last_four: "NEW2",
      created_at: new Date(),
    });
    mockApiKey.update.mockResolvedValue({});

    const result = await service.rotateApiKey("m_1", "key_old", "m_1", CONTEXT);

    const [entry] = allWrittenAuditData();
    expect(entry).toMatchObject({
      action: "rotated",
      api_key_id: "key_rotated",
      key_prefix: "sk_test_",
      environment: "test",
    });
    expect((entry.metadata as Record<string, unknown>).rotatedFromId).toBe("key_old");
    expect(JSON.stringify(entry)).not.toContain(result.key);
  });

  it("records revocation", async () => {
    mockApiKey.findFirst.mockResolvedValue({
      id: "key_1",
      name: "CI",
      environment: "live",
      status: "active",
      key_last_four: "ZZ99",
    });
    mockApiKey.update.mockResolvedValue({});

    await service.revokeApiKey("m_1", "key_1", "m_1", CONTEXT);

    expect(allWrittenAuditData()[0]).toMatchObject({
      action: "revoked",
      api_key_id: "key_1",
      key_last_four: "ZZ99",
      actor_type: "merchant_user",
    });
  });

  it("does not write an audit entry when the operation fails", async () => {
    mockApiKey.findFirst.mockResolvedValue(null);
    await expect(service.revokeApiKey("m_1", "missing", "m_1", CONTEXT)).rejects.toThrow("API key not found");
    expect(mockAudit.create).not.toHaveBeenCalled();
  });

  it("never fails the key operation if the audit write fails", async () => {
    mockAudit.create.mockRejectedValue(new Error("db down"));
    await expect(
      recordApiKeyEvent({ merchantId: "m_1", action: "revoked", keyPrefix: "sk_live_" }),
    ).resolves.toBe(false);
  });
});

describe("GET /merchants/audit-logs", () => {
  function res() {
    const r = { statusCode: 200, body: undefined as unknown } as { statusCode: number; body: unknown } & Record<string, unknown>;
    r.status = jest.fn((code: number) => {
      r.statusCode = code;
      return r;
    });
    r.json = jest.fn((b: unknown) => {
      r.body = b;
      return r;
    });
    return r as unknown as Response & { statusCode: number; body: unknown };
  }

  it("returns the owner's entries newest first, scoped to their merchant", async () => {
    mockAudit.findMany.mockResolvedValue([{ id: "a1" }]);
    mockAudit.count.mockResolvedValue(1);
    const r = res();

    await getMerchantAuditLogs(
      { merchantId: "m_1", user: { id: "m_1" }, query: { action: "revoked", limit: "5" } } as unknown as Request,
      r,
    );

    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ data: [{ id: "a1" }], pagination: { page: 1, limit: 5, total: 1, total_pages: 1 } });
    expect(mockAudit.findMany.mock.calls[0][0]).toMatchObject({
      where: { merchantId: "m_1", action: "revoked" },
      orderBy: { created_at: "desc" },
    });
  });

  it("refuses API-key callers (owners only)", async () => {
    const r = res();
    await getMerchantAuditLogs({ merchantId: "m_1", query: {} } as unknown as Request, r);
    expect(r.statusCode).toBe(403);
    expect(mockAudit.findMany).not.toHaveBeenCalled();
  });

  it("validates query parameters", async () => {
    const r = res();
    await getMerchantAuditLogs(
      { merchantId: "m_1", user: { id: "m_1" }, query: { action: "deleted" } } as unknown as Request,
      r,
    );
    expect(r.statusCode).toBe(400);
  });

  it("caps page size at 100", async () => {
    mockAudit.findMany.mockResolvedValue([]);
    mockAudit.count.mockResolvedValue(0);
    await listApiKeyAuditLogs("m_1", { limit: 500 });
    expect(mockAudit.findMany.mock.calls[0][0]).toMatchObject({ take: 100 });
  });
});
