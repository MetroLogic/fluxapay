import { DataExportStatus } from "../../generated/client/client";

const mockJob = {
  id: "job-1",
  merchantId: "merchant-1",
  status: DataExportStatus.pending,
  payload: null,
  error: null,
  requested_by: "merchant",
  expires_at: new Date(Date.now() + 86400000),
  created_at: new Date(),
  updated_at: new Date(),
};

const mockMerchant = {
  id: "merchant-1",
  business_name: "Acme Ltd",
  email: "acme@example.com",
  phone_number: "+1234567890",
  country: "NG",
  settlement_currency: "NGN",
  status: "active",
  created_at: new Date(),
  kyc: null,
  bankAccount: null,
};

const mockPayments = [
  {
    id: "pay-1",
    amount: "100",
    currency: "USDC",
    status: "confirmed",
    customer_email: "customer@example.com",
    description: "Test",
    createdAt: new Date(),
    confirmed_at: new Date(),
    settled_at: null,
    transaction_hash: "abc123",
  },
];

const mockWebhookLogs = [
  {
    id: "wh-1",
    event_type: "payment_completed",
    endpoint_url: "https://example.com/webhook",
    http_status: 200,
    status: "delivered",
    retry_count: 0,
    created_at: new Date(),
  },
];

const dataExportJob = {
  create: jest.fn(),
  update: jest.fn(),
  findFirst: jest.fn(),
};

const merchant = { findUnique: jest.fn() };
const payment = { findMany: jest.fn() };
const webhookLog = { findMany: jest.fn() };

jest.mock("../../generated/client/client", () => ({
  PrismaClient: jest.fn(() => ({
    dataExportJob,
    merchant,
    payment,
    webhookLog,
  })),
  DataExportStatus: {
    pending: "pending",
    processing: "processing",
    completed: "completed",
    failed: "failed",
  },
}));

jest.mock("../audit.service", () => ({
  logDataExportRequested: jest.fn().mockResolvedValue(null),
  logDataExportCompleted: jest.fn().mockResolvedValue(null),
  logDataExportFailed: jest.fn().mockResolvedValue(null),
  logDataExportDownloaded: jest.fn().mockResolvedValue(null),
}));

jest.mock("../usage.service", () => ({
  getMerchantPlanFeatures: jest.fn().mockResolvedValue(["data_export_pii"]),
  merchantHasFeature: jest.fn().mockReturnValue(true),
}));

import {
  requestDataExport,
  getExportJob,
  downloadExport,
  assertMerchantExportAccess,
} from "../dataExport.service";

describe("dataExport.service", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("assertMerchantExportAccess", () => {
    it("allows own merchant export", () => {
      expect(() =>
        assertMerchantExportAccess("merchant-1", "merchant-1"),
      ).not.toThrow();
    });

    it("returns 403 for other merchant export", () => {
      expect(() =>
        assertMerchantExportAccess("merchant-1", "merchant-2"),
      ).toThrow(expect.objectContaining({ status: 403 }));
    });

    it("allows admin cross-merchant export", () => {
      expect(() =>
        assertMerchantExportAccess("merchant-1", "merchant-2", true),
      ).not.toThrow();
    });
  });

  describe("requestDataExport", () => {
    it("creates a job and returns jobId + pending status", async () => {
      dataExportJob.create.mockResolvedValue(mockJob);
      dataExportJob.update.mockResolvedValue({ ...mockJob, status: "processing" });
      merchant.findUnique.mockResolvedValue(mockMerchant);
      payment.findMany.mockResolvedValue(mockPayments);
      webhookLog.findMany.mockResolvedValue(mockWebhookLogs);

      const result = await requestDataExport("merchant-1", "merchant");

      expect(dataExportJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: "merchant-1",
            requested_by: "merchant",
          }),
        }),
      );
      expect(result.jobId).toBe("job-1");
      expect(result.status).toBe(DataExportStatus.pending);
    });
  });

  describe("getExportJob", () => {
    it("returns the job when found for own merchant", async () => {
      dataExportJob.findFirst.mockResolvedValue(mockJob);
      const job = await getExportJob("job-1", "merchant-1", "merchant-1");
      expect(job.id).toBe("job-1");
    });

    it("throws 403 when accessing another merchant job", async () => {
      await expect(
        getExportJob("job-1", "merchant-2", "merchant-1"),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("throws 404 when job not found", async () => {
      dataExportJob.findFirst.mockResolvedValue(null);
      await expect(getExportJob("missing", "merchant-1", "merchant-1")).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe("downloadExport", () => {
    it("throws 403 for cross-merchant download", async () => {
      await expect(
        downloadExport("job-1", "merchant-2", "merchant-1"),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("returns parsed JSON for a valid completed job", async () => {
      const exportData = { exported_at: "2026-01-01", merchant_profile: {}, payments_summary: { total: 1 }, webhook_logs_summary: { total: 0 } };
      const payload = Buffer.from(JSON.stringify(exportData)).toString("base64");
      dataExportJob.findFirst.mockResolvedValue({
        ...mockJob,
        status: DataExportStatus.completed,
        payload,
        expires_at: new Date(Date.now() + 86400000),
      });

      const result = await downloadExport("job-1", "merchant-1", "merchant-1");
      expect(result).toMatchObject({ exported_at: "2026-01-01" });
    });

    it("allows admin download for any merchant", async () => {
      const exportData = { exported_at: "2026-01-01", payments_summary: { total: 0 }, webhook_logs_summary: { total: 0 } };
      const payload = Buffer.from(JSON.stringify(exportData)).toString("base64");
      dataExportJob.findFirst.mockResolvedValue({
        ...mockJob,
        status: DataExportStatus.completed,
        payload,
        expires_at: new Date(Date.now() + 86400000),
      });

      const result = await downloadExport("job-1", "merchant-2", "merchant-2", { isAdmin: true });
      expect(result).toMatchObject({ exported_at: "2026-01-01" });
    });
  });
});
