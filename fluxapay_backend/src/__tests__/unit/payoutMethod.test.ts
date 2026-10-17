/**
 * Merchant payout methods (#1249): validation rules, encryption at rest,
 * masked responses, merchant scoping, and CRUD behaviour.
 */

jest.mock("../../utils/logger", () => ({
  getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  getMetricsCollector: () => ({ increment: jest.fn() }),
}));
jest.mock("../../helpers/apiError.helper", () => ({
  apiError: (status: number, code: string, message: string) => ({ status, code, message }),
  sendApiError: (
    res: { status: (n: number) => { json: (b: unknown) => unknown } },
    err: { status?: number; code?: string; message?: string; errors?: unknown },
  ) => res.status(err.status ?? 500).json({ code: err.code, message: err.message, errors: err.errors }),
}));

type Row = Record<string, any>;
const rows: Row[] = [];
let seq = 0;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "not" in v) return row[k] !== v.not;
    return row[k] === v;
  });
}

const mockDelegate = {
  findMany: jest.fn(async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where))),
  findFirst: jest.fn(async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null),
  count: jest.fn(async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where)).length),
  create: jest.fn(async ({ data }: { data: Row }) => {
    const row = { id: `pm_${++seq}`, created_at: new Date(seq * 1000), updated_at: new Date(), archived_at: null, ...data };
    rows.push(row);
    return row;
  }),
  update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const row = rows.find((r) => r.id === where.id)!;
    Object.assign(row, data);
    return row;
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const hit = rows.filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  }),
};

jest.mock("../../config/prisma", () => ({
  prisma: {
    merchantPayoutMethod: mockDelegate,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ merchantPayoutMethod: mockDelegate }),
  },
}));

import type { Request, Response } from "express";
import {
  createPayoutMethodSchema,
  isValidAbaRoutingNumber,
} from "../../schemas/payoutMethod.schema";
import {
  archivePayoutMethod,
  createPayoutMethod,
  listPayoutMethods,
  MAX_PAYOUT_METHODS,
} from "../../services/payoutMethod.service";
import { decryptField, encryptField, fingerprint, resetEncryptionKeyCache } from "../../utils/fieldEncryption.util";
import { postPayoutMethod, deletePayoutMethod } from "../../controllers/payoutMethod.controller";

const NG = {
  country: "NG",
  beneficiary_name: "Acme Coffee Ltd",
  account_number: "0123456789",
  bank_code: "058",
};
const US = {
  country: "US",
  beneficiary_name: "Acme Inc.",
  account_number: "000123456789",
  routing_number: "021000021",
};

function parse(input: unknown) {
  return createPayoutMethodSchema.safeParse(input);
}

function fieldErrors(input: unknown): string[] {
  const result = parse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

beforeEach(() => {
  rows.length = 0;
  seq = 0;
  jest.clearAllMocks();
  resetEncryptionKeyCache();
});

describe("validation", () => {
  it("accepts well-formed accounts for supported countries and normalises input", () => {
    const ng = parse({ ...NG, account_number: "0123 456-789", country: "ng" });
    expect(ng.success).toBe(true);
    if (ng.success) {
      expect(ng.data.account_number).toBe("0123456789");
      expect(ng.data.country).toBe("NG");
      expect(ng.data.type).toBe("bank_account");
    }
    expect(parse(US).success).toBe(true);
    expect(parse({ country: "GB", beneficiary_name: "Jane Doe", account_number: "12345678", bank_code: "40-47-84" }).success).toBe(true);
  });

  it("rejects unsupported countries and mismatched currencies", () => {
    expect(fieldErrors({ ...NG, country: "FR" })).toContain("country");
    expect(fieldErrors({ ...NG, currency: "USD" })).toContain("currency");
    expect(parse({ ...NG, currency: "ngn" }).success).toBe(true);
  });

  it("enforces account number and bank code shapes per country", () => {
    expect(fieldErrors({ ...NG, account_number: "12345" })).toContain("account_number");
    expect(fieldErrors({ ...NG, bank_code: undefined })).toContain("bank_code");
    expect(fieldErrors({ ...NG, bank_code: "58" })).toContain("bank_code");
  });

  it("requires a checksum-valid ABA routing number for US accounts", () => {
    expect(isValidAbaRoutingNumber("021000021")).toBe(true);
    expect(isValidAbaRoutingNumber("021000022")).toBe(false);
    expect(fieldErrors({ ...US, routing_number: "021000022" })).toContain("routing_number");
    expect(fieldErrors({ ...US, routing_number: undefined })).toContain("routing_number");
    expect(fieldErrors({ ...NG, routing_number: "021000021" })).toContain("routing_number");
  });

  it("validates the beneficiary name", () => {
    expect(fieldErrors({ ...NG, beneficiary_name: "A" })).toContain("beneficiary_name");
    expect(fieldErrors({ ...NG, beneficiary_name: "<script>" })).toContain("beneficiary_name");
    expect(parse({ ...NG, beneficiary_name: "Ọlá Adébáyọ̀ & Sons" }).success).toBe(true);
  });
});

describe("field encryption", () => {
  it("round-trips with a random IV and authenticates the ciphertext", () => {
    const a = encryptField("0123456789");
    const b = encryptField("0123456789");
    expect(a).not.toBe(b);
    expect(a).not.toContain("0123456789");
    expect(decryptField(a)).toBe("0123456789");

    const [v, iv, tag, data] = a.split(":");
    const tampered = [v, iv, tag, Buffer.from("garbage").toString("base64")].join(":");
    expect(() => decryptField(tampered)).toThrow();
  });

  it("produces stable keyed fingerprints", () => {
    expect(fingerprint("NG", "058", "0123456789")).toBe(fingerprint("NG", "058", "0123456789"));
    expect(fingerprint("NG", "058", "0123456789")).not.toBe(fingerprint("NG", "044", "0123456789"));
  });
});

describe("payout method service", () => {
  async function create(merchantId: string, input: unknown) {
    const parsed = createPayoutMethodSchema.parse(input);
    return createPayoutMethod(merchantId, parsed);
  }

  it("stores encrypted details and returns only masked values", async () => {
    const dto = await create("m_1", US);

    expect(dto).toMatchObject({
      status: "pending_verification",
      country: "US",
      currency: "USD",
      account_number_last4: "6789",
      account_number_masked: "******6789",
      routing_number_masked: "*****0021",
      is_default: true,
    });
    expect(JSON.stringify(dto)).not.toContain("000123456789");
    expect(JSON.stringify(dto)).not.toContain("021000021");
    expect(dto).not.toHaveProperty("account_number_encrypted");
    expect(dto).not.toHaveProperty("account_fingerprint");

    const stored = rows[0];
    expect(stored.account_number_encrypted).not.toContain("000123456789");
    expect(decryptField(stored.account_number_encrypted)).toBe("000123456789");
    expect(decryptField(stored.routing_number_encrypted)).toBe("021000021");
  });

  it("lists only the caller's non-archived methods, default first", async () => {
    await create("m_1", NG);
    await create("m_1", { ...NG, account_number: "9876543210", is_default: true });
    await create("m_2", NG);

    const list = await listPayoutMethods("m_1");
    expect(list).toHaveLength(2);
    expect(list.every((m) => m.account_number_last4 !== undefined)).toBe(true);
    expect(rows.filter((r) => r.merchantId === "m_1" && r.is_default)).toHaveLength(1);
    expect(rows.find((r) => r.is_default && r.merchantId === "m_1")!.account_number_last4).toBe("3210");
  });

  it("rejects duplicates of an active account (409)", async () => {
    await create("m_1", NG);
    await expect(create("m_1", NG)).rejects.toMatchObject({ status: 409 });
    // A different merchant may hold the same account.
    await expect(create("m_2", NG)).resolves.toBeDefined();
  });

  it("enforces the per-merchant limit (422)", async () => {
    for (let i = 0; i < MAX_PAYOUT_METHODS; i++) {
      await create("m_1", { ...NG, account_number: String(1000000000 + i) });
    }
    await expect(create("m_1", { ...NG, account_number: "1999999999" })).rejects.toMatchObject({ status: 422 });
  });

  it("archives (soft-deletes) and promotes a new default", async () => {
    const first = await create("m_1", NG);
    const second = await create("m_1", { ...NG, account_number: "9876543210" });

    const archived = await archivePayoutMethod("m_1", first.id);
    expect(archived).toMatchObject({ status: "archived", is_default: false });
    expect(archived.archived_at).toBeInstanceOf(Date);
    expect(rows.find((r) => r.id === second.id)!.is_default).toBe(true);

    expect(await listPayoutMethods("m_1")).toHaveLength(1);
    expect(await listPayoutMethods("m_1", { includeArchived: true })).toHaveLength(2);
    await expect(archivePayoutMethod("m_1", first.id)).rejects.toMatchObject({ status: 409 });

    // Archived accounts can be re-added.
    await expect(create("m_1", NG)).resolves.toBeDefined();
  });

  it("never lets a merchant touch another merchant's method (404)", async () => {
    const theirs = await create("m_2", NG);
    await expect(archivePayoutMethod("m_1", theirs.id)).rejects.toMatchObject({ status: 404 });
    expect(rows.find((r) => r.id === theirs.id)!.status).toBe("pending_verification");
  });
});

describe("controllers", () => {
  function res() {
    const r: Record<string, unknown> & { statusCode: number; body: unknown } = { statusCode: 200, body: undefined };
    r.status = jest.fn((c: number) => {
      r.statusCode = c;
      return r;
    });
    r.json = jest.fn((b: unknown) => {
      r.body = b;
      return r;
    });
    return r as unknown as Response & { statusCode: number; body: any };
  }

  it("POST validates and returns 201 with the masked method", async () => {
    const r = res();
    await postPayoutMethod({ merchantId: "m_1", body: NG } as unknown as Request, r);
    expect(r.statusCode).toBe(201);
    expect(r.body.data.account_number_masked).toBe("******6789");

    const bad = res();
    await postPayoutMethod({ merchantId: "m_1", body: { ...NG, account_number: "1" } } as unknown as Request, bad);
    expect(bad.statusCode).toBe(400);
  });

  it("requires authentication", async () => {
    const r = res();
    await postPayoutMethod({ body: NG } as unknown as Request, r);
    expect(r.statusCode).toBe(401);
  });

  it("DELETE archives the caller's method", async () => {
    const created = await createPayoutMethod("m_1", createPayoutMethodSchema.parse(NG));
    const r = res();
    await deletePayoutMethod({ merchantId: "m_1", params: { id: created.id } } as unknown as Request, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.status).toBe("archived");
  });
});
