import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requestJob, jobStatus, downloadJob, publishNotification } = vi.hoisted(
  () => ({
    requestJob: vi.fn(),
    jobStatus: vi.fn(),
    downloadJob: vi.fn(),
    publishNotification: vi.fn(),
  }),
);

vi.mock("@/lib/api", () => ({
  api: {
    merchantExports: {
      request: requestJob,
      status: jobStatus,
      download: downloadJob,
    },
  },
}));

vi.mock("@/lib/dashboardNotifications", () => ({
  publishLocalDashboardNotification: publishNotification,
}));

import {
  buildExportFilename,
  exportDataToCsv,
  PAYMENT_EXPORT_COLUMNS,
  toCsv,
} from "../dataExport.service";

describe("toCsv", () => {
  it("writes the payments header in column order", () => {
    const header = toCsv("payments", []);
    expect(header).toBe(
      PAYMENT_EXPORT_COLUMNS.map((column) => `"${column.label}"`).join(","),
    );
  });

  it("quotes values and escapes embedded quotes", () => {
    const csv = toCsv("payments", [
      {
        id: "pay_1",
        amount: 25,
        currency: "USDC",
        status: "paid",
        customer_email: 'a"b@example.com',
        description: "Invoice, phase 1",
      },
    ]);

    const rows = csv.split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"a""b@example.com"');
    expect(rows[1]).toContain('"Invoice, phase 1"');
  });

  it("emits an empty quoted field for missing values", () => {
    const csv = toCsv("payments", [{ id: "pay_1" }]);
    const dataRow = csv.split("\n")[1];

    expect(dataRow.startsWith('"pay_1","')).toBe(true);
    expect(dataRow.match(/"[^"]*"/g)).toHaveLength(
      PAYMENT_EXPORT_COLUMNS.length,
    );
  });
});

describe("buildExportFilename", () => {
  it("names the file after the resource and day", () => {
    expect(
      buildExportFilename(
        "payments",
        "csv",
        new Date("2026-03-04T12:00:00.000Z"),
      ),
    ).toBe("payments_export_2026-03-04.csv");
  });
});

describe("exportDataToCsv", () => {
  const createdBlobs: Blob[] = [];
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    createdBlobs.length = 0;
    requestJob.mockReset();
    jobStatus.mockReset();
    downloadJob.mockReset();
    publishNotification.mockReset();
    publishNotification.mockImplementation((input) => ({ ...input }));

    // jsdom has no object-URL support, so capture the Blob the service builds.
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return "blob:mock";
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    requestJob.mockResolvedValue({ data: { jobId: "job_1", status: "processing" } });
    jobStatus.mockResolvedValue({ data: { jobId: "job_1", status: "completed" } });
    downloadJob.mockResolvedValue({
      data: {
        payments_summary: {
          records: [
            { id: "pay_1", amount: 25, currency: "USDC", status: "paid" },
            { id: "pay_2", amount: 40, currency: "USDC", status: "paid" },
          ],
        },
      },
    });
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL as typeof URL.revokeObjectURL;
  });

  it("writes the finished job's rows into the downloaded file", async () => {
    const result = await exportDataToCsv({
      resource: "payments",
      format: "csv",
      filters: { status: "paid" },
    });

    // Regression guard: the api layer returns `{ data } | { error }`, so the
    // payload has to be unwrapped before its records are read. Reading the
    // wrapper instead yields zero rows and a header-only file.
    expect(result.rowCount).toBe(2);
    expect(createdBlobs).toHaveLength(1);

    const csv = await createdBlobs[0].text();
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv).toContain('"pay_1","25"');
    expect(csv).toContain('"pay_2","40"');
  });

  it("sends the active filters and omits page/limit", async () => {
    await exportDataToCsv({
      resource: "payments",
      format: "csv",
      filters: { status: "paid", currency: "USDC", date_from: "2026-02-01" },
    });

    expect(requestJob).toHaveBeenCalledTimes(1);
    expect(requestJob).toHaveBeenCalledWith({
      resource: "payments",
      format: "csv",
      filters: { status: "paid", currency: "USDC", date_from: "2026-02-01" },
    });
    const sent = requestJob.mock.calls[0][0];
    expect(sent).not.toHaveProperty("page");
    expect(sent).not.toHaveProperty("limit");
  });

  it("reports a failed job instead of downloading an empty file", async () => {
    jobStatus.mockResolvedValue({
      data: { jobId: "job_1", status: "failed", error: "Upstream timeout" },
    });

    await expect(
      exportDataToCsv({ resource: "payments", format: "csv" }),
    ).rejects.toThrow("Upstream timeout");
    expect(createdBlobs).toHaveLength(0);
  });

  it("surfaces a transport error from the api layer", async () => {
    requestJob.mockResolvedValue({ error: new Error("Export service down") });

    await expect(
      exportDataToCsv({ resource: "payments", format: "csv" }),
    ).rejects.toThrow("Export service down");
    expect(downloadJob).not.toHaveBeenCalled();
  });

  it("publishes a dashboard notification naming the file", async () => {
    await exportDataToCsv({ resource: "payments", format: "csv" });

    expect(publishNotification).toHaveBeenCalledTimes(1);
    expect(publishNotification.mock.calls[0][0]).toMatchObject({
      category: "export",
      severity: "info",
      title: "Export ready",
      href: "/dashboard/payments",
    });
  });
});
