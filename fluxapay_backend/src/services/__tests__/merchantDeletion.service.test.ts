import { AuditActionType, AuditEntityType } from "../../generated/client/client";

// ── Prisma mock ───────────────────────────────────────────────────────────────
const merchant = { findUnique: jest.fn(), update: jest.fn() };
const merchantDeletionRequest = {
  upsert: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};
const merchantKYC = { updateMany: jest.fn() };
const kYCDocument = { deleteMany: jest.fn() };
const webhookLog = { updateMany: jest.fn() };
const oTP = { deleteMany: jest.fn() };
const bankAccount = { deleteMany: jest.fn() };
const merchantSubscription = { deleteMany: jest.fn() };
const customer = { deleteMany: jest.fn() };
const auditLog = { create: jest.fn() };

// $transaction executes the callback with the same mock client
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
  auditLog,
};

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    ...txClient,
    $transaction: jest.fn((fn: (tx: typeof txClient) => Promise<void>) => fn(txClient)),
  })),
  AuditActionType: {
    merchant_deletion_requested: "merchant_deletion_requested",
    merchant_anonymized: "merchant_anonymized",
  },
  AuditEntityType: {
    merchant_account: "merchant_account",
  },
}));

import {
  requestDeletion,
  executeDeletion,
  getDeletionRequest,
} from "../merchantDeletion.service";

const MERCHANT_ID = "merchant-1";
const ADMIN_ID = "admin-1";

const activeMerchant = {
  id: MERCHANT_ID,
  anonymized_at: null,
  deletion_requested_at: null,
};

beforeEach(() => jest.clearAllMocks());

describe("requestDeletion", () => {
  it("creates a deletion request and audit log", async () => {
    merchant.findUnique.mockResolvedValue(activeMerchant);
    merchantDeletionRequest.upsert.mockResolvedValue({ id: "req-1", merchantId: MERCHANT_ID });
    merchant.update.mockResolvedValue({});
    auditLog.create.mockResolvedValue({});

    const result = await requestDeletion(MERCHANT_ID, "merchant", "closing business");

    expect(merchantDeletionRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantId: MERCHANT_ID },
        create: expect.objectContaining({ requested_by: "merchant" }),
      }),
    );
    expect(merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletion_requested_at: expect.any(Date) }) }),
    );
    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action_type: AuditActionType.merchant_deletion_requested,
          entity_type: AuditEntityType.merchant_account,
          entity_id: MERCHANT_ID,
        }),
      }),
    );
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
    merchantDeletionRequest.findUnique.mockResolvedValue({ id: "req-1", merchantId: MERCHANT_ID });
    merchant.update.mockResolvedValue({});
    merchantKYC.updateMany.mockResolvedValue({});
    kYCDocument.deleteMany.mockResolvedValue({});
    webhookLog.updateMany.mockResolvedValue({});
    oTP.deleteMany.mockResolvedValue({});
    bankAccount.deleteMany.mockResolvedValue({});
    merchantSubscription.deleteMany.mockResolvedValue({});
    customer.deleteMany.mockResolvedValue({});
    merchantDeletionRequest.update.mockResolvedValue({});
    auditLog.create.mockResolvedValue({});
  });

  it("anonymizes PII and writes audit log", async () => {
    await executeDeletion(MERCHANT_ID, ADMIN_ID);

    expect(merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: expect.stringContaining("anonymized.invalid"),
          password: "REDACTED",
          anonymized_at: expect.any(Date),
        }),
      }),
    );
    expect(kYCDocument.deleteMany).toHaveBeenCalled();
    expect(oTP.deleteMany).toHaveBeenCalled();
    expect(bankAccount.deleteMany).toHaveBeenCalled();
    expect(auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action_type: AuditActionType.merchant_anonymized,
          entity_id: MERCHANT_ID,
        }),
      }),
    );
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
