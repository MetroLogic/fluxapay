import { AuditActionType, AuditEntityType } from "../../generated/client/client";

jest.mock("../audit.service", () => ({
  logMerchantDeleted: jest.fn().mockResolvedValue({}),
  logApiKeysRevoked: jest.fn().mockResolvedValue({}),
  logWebhooksDeactivated: jest.fn().mockResolvedValue({}),
  logChargesCancelled: jest.fn().mockResolvedValue({}),
}));

// Mock Cloudinary service so unit tests don't make real HTTP calls.
const mockDeleteFromCloudinary = jest.fn().mockResolvedValue(undefined);
jest.mock("../cloudinary.service", () => ({
  deleteFromCloudinary: (...args: unknown[]) => mockDeleteFromCloudinary(...args),
}));

const merchant = { findUnique: jest.fn(), update: jest.fn() };
const merchantDeletionRequest = {
  upsert: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};
const merchantKYC = { updateMany: jest.fn() };
const kYCDocument = { findMany: jest.fn(), deleteMany: jest.fn() };
const webhookLog = { updateMany: jest.fn() };
const oTP = { deleteMany: jest.fn() };
const bankAccount = { deleteMany: jest.fn() };
const merchantSubscription = { deleteMany: jest.fn() };
const customer = { deleteMany: jest.fn() };
const refreshToken = { deleteMany: jest.fn() };
const apiKey = { updateMany: jest.fn() };
const payment = { updateMany: jest.fn() };

const txClient = {
  merchant,
  merchantDeletionRequest,
  merchantKYC,
  kYCDocument,
  webhookLog,
  oTP,
  bankAccount,
  merchantSubscription,
  customer,
  refreshToken,
  apiKey,
  payment,
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    ...txClient,
    $transaction: jest.fn((fn: (tx: typeof txClient) => Promise<void>) => fn(txClient)),
  })),
  AuditActionType: {},
  AuditEntityType: {},
}));

import {
  requestDeletion,
  executeDeletion,
  getDeletionRequest,
} from "../merchantDeletion.service";
import {
  logMerchantDeleted,
  logApiKeysRevoked,
  logWebhooksDeactivated,
  logChargesCancelled,
} from "../audit.service";

const MERCHANT_ID = "merchant-1";
const ADMIN_ID = "admin-1";

const activeMerchant = {
  id: MERCHANT_ID,
  anonymized_at: null,
  deletion_requested_at: null,
};

beforeEach(() => jest.clearAllMocks());

describe("requestDeletion", () => {
  it("creates a deletion request", async () => {
    merchant.findUnique.mockResolvedValue(activeMerchant);
    merchantDeletionRequest.upsert.mockResolvedValue({ id: "req-1", merchantId: MERCHANT_ID });
    merchant.update.mockResolvedValue({});

    const result = await requestDeletion(MERCHANT_ID, "merchant", "closing business");

    expect(merchantDeletionRequest.upsert).toHaveBeenCalled();
    expect(result.requestId).toBe("req-1");
  });

  it("throws 404 when merchant not found", async () => {
    merchant.findUnique.mockResolvedValue(null);
    await expect(requestDeletion(MERCHANT_ID, "merchant")).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when already anonymized", async () => {
    merchant.findUnique.mockResolvedValue({ ...activeMerchant, anonymized_at: new Date() });
    await expect(requestDeletion(MERCHANT_ID, "merchant")).rejects.toMatchObject({ status: 409 });
  });
});

describe("executeDeletion", () => {
  beforeEach(() => {
    merchant.findUnique.mockResolvedValue(activeMerchant);
    merchantDeletionRequest.findUnique.mockResolvedValue({
      id: "req-1",
      merchantId: MERCHANT_ID,
      reason: "gdpr request",
    });
    merchant.update.mockResolvedValue({});
    merchantKYC.updateMany.mockResolvedValue({});
    // Default: no KYC docs — override per-test to simulate documents.
    kYCDocument.findMany.mockResolvedValue([]);
    kYCDocument.deleteMany.mockResolvedValue({});
    webhookLog.updateMany.mockResolvedValue({ count: 2 });
    oTP.deleteMany.mockResolvedValue({});
    bankAccount.deleteMany.mockResolvedValue({});
    merchantSubscription.deleteMany.mockResolvedValue({});
    customer.deleteMany.mockResolvedValue({});
    refreshToken.deleteMany.mockResolvedValue({});
    merchantDeletionRequest.update.mockResolvedValue({});
    apiKey.updateMany.mockResolvedValue({ count: 3 });
    payment.updateMany.mockResolvedValue({ count: 1 });
    mockDeleteFromCloudinary.mockResolvedValue(undefined);
  });

  it("revokes API keys, cancels webhooks/charges, and emits audit events", async () => {
    await executeDeletion(MERCHANT_ID, ADMIN_ID);

    expect(apiKey.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantId: MERCHANT_ID, status: "active" },
        data: { status: "revoked" },
      }),
    );
    expect(webhookLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          merchantId: MERCHANT_ID,
          status: { in: ["pending", "retrying"] },
        }),
      }),
    );
    expect(payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          merchantId: MERCHANT_ID,
          status: { in: ["pending", "partially_paid"] },
        }),
        data: { status: "cancelled" },
      }),
    );
    expect(logMerchantDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: ADMIN_ID, merchantId: MERCHANT_ID, reason: "gdpr request" }),
      txClient,
    );
    expect(logApiKeysRevoked).toHaveBeenCalled();
    expect(logWebhooksDeactivated).toHaveBeenCalled();
    expect(logChargesCancelled).toHaveBeenCalled();
  });

  it("throws 404 when merchant not found", async () => {
    merchant.findUnique.mockResolvedValue(null);
    await expect(executeDeletion(MERCHANT_ID, ADMIN_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when already anonymized", async () => {
    merchant.findUnique.mockResolvedValue({ ...activeMerchant, anonymized_at: new Date() });
    await expect(executeDeletion(MERCHANT_ID, ADMIN_ID)).rejects.toMatchObject({ status: 409 });
  });

  it("throws 400 when no deletion request exists", async () => {
    merchantDeletionRequest.findUnique.mockResolvedValue(null);
    await expect(executeDeletion(MERCHANT_ID, ADMIN_ID)).rejects.toMatchObject({ status: 400 });
  });
});

describe("getDeletionRequest", () => {
  it("returns the request when found", async () => {
    const req = { id: "req-1", merchantId: MERCHANT_ID };
    merchantDeletionRequest.findUnique.mockResolvedValue(req);
    const result = await getDeletionRequest(MERCHANT_ID);
    expect(result.id).toBe("req-1");
  });

  it("throws 404 when not found", async () => {
    merchantDeletionRequest.findUnique.mockResolvedValue(null);
    await expect(getDeletionRequest(MERCHANT_ID)).rejects.toMatchObject({ status: 404 });
  });
});

// ─── Issue #720: Cloudinary KYC document purge on merchant deletion ───────────

describe("executeDeletion — Cloudinary KYC purge (#720)", () => {
  beforeEach(() => {
    merchant.findUnique.mockResolvedValue(activeMerchant);
    merchantDeletionRequest.findUnique.mockResolvedValue({
      id: "req-1",
      merchantId: MERCHANT_ID,
      reason: "gdpr request",
    });
    merchant.update.mockResolvedValue({});
    merchantKYC.updateMany.mockResolvedValue({});
    kYCDocument.deleteMany.mockResolvedValue({});
    webhookLog.updateMany.mockResolvedValue({ count: 0 });
    oTP.deleteMany.mockResolvedValue({});
    bankAccount.deleteMany.mockResolvedValue({});
    merchantSubscription.deleteMany.mockResolvedValue({});
    customer.deleteMany.mockResolvedValue({});
    refreshToken.deleteMany.mockResolvedValue({});
    merchantDeletionRequest.update.mockResolvedValue({});
    apiKey.updateMany.mockResolvedValue({ count: 0 });
    payment.updateMany.mockResolvedValue({ count: 0 });
  });

  it("calls deleteFromCloudinary for each KYC document public_id before deleting DB rows", async () => {
    const docs = [
      { id: "doc-1", public_id: "kyc-documents/merchant-1-passport" },
      { id: "doc-2", public_id: "kyc-documents/merchant-1-address-proof" },
    ];
    kYCDocument.findMany.mockResolvedValue(docs);
    mockDeleteFromCloudinary.mockResolvedValue(undefined);

    await executeDeletion(MERCHANT_ID, ADMIN_ID);

    expect(kYCDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kyc: { merchantId: MERCHANT_ID } },
        select: { id: true, public_id: true },
      }),
    );

    // One call per document
    expect(mockDeleteFromCloudinary).toHaveBeenCalledTimes(docs.length);
    expect(mockDeleteFromCloudinary).toHaveBeenCalledWith(docs[0]!.public_id);
    expect(mockDeleteFromCloudinary).toHaveBeenCalledWith(docs[1]!.public_id);

    // DB rows are deleted regardless of Cloudinary outcome
    expect(kYCDocument.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kyc: { merchantId: MERCHANT_ID } } }),
    );
  });

  it("still deletes DB rows and completes deletion even when Cloudinary purge fails", async () => {
    const docs = [{ id: "doc-1", public_id: "kyc-documents/merchant-1-passport" }];
    kYCDocument.findMany.mockResolvedValue(docs);
    // Simulate a Cloudinary API error
    mockDeleteFromCloudinary.mockRejectedValue(new Error("Cloudinary 503 Service Unavailable"));

    // Deletion must not throw — Cloudinary failure is logged but non-fatal
    await expect(executeDeletion(MERCHANT_ID, ADMIN_ID)).resolves.toBeUndefined();

    // DB rows are still deleted so PII is removed
    expect(kYCDocument.deleteMany).toHaveBeenCalled();
  });

  it("skips Cloudinary calls and DB delete when merchant has no KYC documents", async () => {
    kYCDocument.findMany.mockResolvedValue([]);

    await executeDeletion(MERCHANT_ID, ADMIN_ID);

    expect(mockDeleteFromCloudinary).not.toHaveBeenCalled();
    // deleteMany is still called (no-op is fine; it won't error)
    expect(kYCDocument.deleteMany).toHaveBeenCalled();
  });
});

// ─── Issue #812: In-flight settlement guard ───────────────────────────────────

describe("executeDeletion — in-flight settlement guard (#812)", () => {
  const settlement = { findMany: jest.fn() };

  // Extend the prisma mock to include `settlement`
  beforeAll(() => {
    const { PrismaClient } = jest.requireMock("../../generated/client/client") as any;
    const instance = new PrismaClient();
    Object.assign(instance, { settlement });
    // Re-apply so the module under test uses the updated mock instance.
    // Because PrismaClient is called once at module load, we patch the prototype instead.
    PrismaClient.mockImplementation(() => ({
      ...txClient,
      settlement,
      $transaction: jest.fn((fn: (tx: typeof txClient) => Promise<void>) => fn(txClient)),
    }));
  });

  beforeEach(() => {
    jest.clearAllMocks();

    merchant.findUnique.mockResolvedValue(activeMerchant);
    merchantDeletionRequest.findUnique.mockResolvedValue({
      id: "req-1",
      merchantId: MERCHANT_ID,
      reason: "test",
    });
    merchant.update.mockResolvedValue({});
    merchantKYC.updateMany.mockResolvedValue({});
    kYCDocument.findMany.mockResolvedValue([]);
    kYCDocument.deleteMany.mockResolvedValue({});
    webhookLog.updateMany.mockResolvedValue({ count: 0 });
    oTP.deleteMany.mockResolvedValue({});
    bankAccount.deleteMany.mockResolvedValue({});
    merchantSubscription.deleteMany.mockResolvedValue({});
    customer.deleteMany.mockResolvedValue({});
    refreshToken.deleteMany.mockResolvedValue({});
    merchantDeletionRequest.update.mockResolvedValue({});
    apiKey.updateMany.mockResolvedValue({ count: 0 });
    payment.updateMany.mockResolvedValue({ count: 0 });
    mockDeleteFromCloudinary.mockResolvedValue(undefined);
  });

  it("throws 409 INFLIGHT_SETTLEMENTS when pending settlements exist and force=false", async () => {
    settlement.findMany.mockResolvedValue([
      { id: "settle-1", status: "pending" },
    ]);

    await expect(executeDeletion(MERCHANT_ID, ADMIN_ID)).rejects.toMatchObject({
      status: 409,
      code: "INFLIGHT_SETTLEMENTS",
    });
  });

  it("throws 409 INFLIGHT_SETTLEMENTS when processing settlements exist and force=false", async () => {
    settlement.findMany.mockResolvedValue([
      { id: "settle-2", status: "processing" },
    ]);

    await expect(executeDeletion(MERCHANT_ID, ADMIN_ID)).rejects.toMatchObject({
      status: 409,
      code: "INFLIGHT_SETTLEMENTS",
    });
  });

  it("proceeds with deletion when no in-flight settlements exist (force=false)", async () => {
    settlement.findMany.mockResolvedValue([]);

    await expect(executeDeletion(MERCHANT_ID, ADMIN_ID)).resolves.toBeUndefined();
  });

  it("proceeds with deletion when force=true even if settlements are in progress", async () => {
    settlement.findMany.mockResolvedValue([
      { id: "settle-3", status: "pending" },
    ]);

    // force=true bypasses the guard
    await expect(executeDeletion(MERCHANT_ID, ADMIN_ID, true)).resolves.toBeUndefined();
  });

  it("does not query settlements at all when force=true", async () => {
    settlement.findMany.mockResolvedValue([{ id: "settle-4", status: "pending" }]);

    await executeDeletion(MERCHANT_ID, ADMIN_ID, true);

    // Guard is skipped — settlement.findMany should NOT have been called
    expect(settlement.findMany).not.toHaveBeenCalled();
  });
});
