import { AuditActionType, AuditEntityType } from "../../generated/client/client";

jest.mock("../audit.service", () => ({
  logMerchantDeleted: jest.fn().mockResolvedValue({}),
  logApiKeysRevoked: jest.fn().mockResolvedValue({}),
  logWebhooksDeactivated: jest.fn().mockResolvedValue({}),
  logChargesCancelled: jest.fn().mockResolvedValue({}),
}));

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
