"use client";

/**
 * Job-based data export service.
 *
 * Large exports cannot be produced synchronously in the request that starts
 * them, so the flow is: request a job, poll it to completion, then download the
 * finished payload and turn it into a file in the browser.
 *
 * This lives in the service layer rather than in a React hook so the async flow
 * can be driven from anywhere and unit-tested without a renderer.
 *
 * Requests sent by this service deliberately omit `page`/`limit`: the point of
 * a bulk export is to cover every record matching the active filters, not just
 * the page the merchant happens to be looking at.
 */

import {
  api,
  type MerchantExportFormat,
  type MerchantExportJobStatus,
  type MerchantExportResource,
} from "@/lib/api";
import {
  publishLocalDashboardNotification,
  type LocalDashboardNotification,
} from "@/lib/dashboardNotifications";

export type DataExportFilters = Record<string, string | number | undefined>;
export type DataExportRow = Record<string, unknown>;

export interface DataExportRequest {
  resource: MerchantExportResource;
  format: MerchantExportFormat;
  /** Active list filters, forwarded to the job so the server does the filtering. */
  filters?: DataExportFilters;
}

export interface DataExportOptions {
  /** Called with elapsed milliseconds while the job is queued or processing. */
  onProgress?: (elapsedMs: number) => void;
  signal?: AbortSignal;
}

export interface DataExportResult {
  jobId: string;
  filename: string;
  rowCount: number;
  completedAt: string;
  /** The dashboard notification published when the export finished. */
  notification: LocalDashboardNotification;
}

type ExportPayload = {
  payments_summary?: { records?: DataExportRow[] };
  webhook_logs_summary?: { records?: DataExportRow[] };
};

type CsvColumn = { key: string; label: string };

/** Columns written to a payments CSV, in order. */
export const PAYMENT_EXPORT_COLUMNS: ReadonlyArray<CsvColumn> = [
  { key: "id", label: "Payment ID" },
  { key: "amount", label: "Amount" },
  { key: "currency", label: "Currency" },
  { key: "status", label: "Status" },
  { key: "customer_email", label: "Customer Email" },
  { key: "description", label: "Description" },
  { key: "transaction_hash", label: "Transaction Hash" },
  { key: "createdAt", label: "Created At" },
  { key: "confirmed_at", label: "Confirmed At" },
  { key: "settled_at", label: "Settled At" },
];

const columnsByResource: Record<MerchantExportResource, ReadonlyArray<CsvColumn>> = {
  payments: PAYMENT_EXPORT_COLUMNS,
  settlements: [
    { key: "id", label: "Settlement ID" },
    { key: "date", label: "Date" },
    { key: "status", label: "Status" },
    { key: "paymentsCount", label: "Payments" },
    { key: "usdcAmount", label: "USDC Amount" },
    { key: "fiatAmount", label: "Fiat Amount" },
    { key: "currency", label: "Currency" },
    { key: "fees", label: "Fees" },
    { key: "bankReference", label: "Bank Reference" },
  ],
  webhooks: [
    { key: "id", label: "Webhook ID" },
    { key: "event_type", label: "Event Type" },
    { key: "status", label: "Status" },
    { key: "endpoint_url", label: "Endpoint" },
    { key: "http_status", label: "HTTP Status" },
    { key: "retry_count", label: "Retries" },
    { key: "created_at", label: "Created At" },
  ],
};

const resourcePaths: Record<MerchantExportResource, string> = {
  payments: "/dashboard/payments",
  settlements: "/dashboard/settlements",
  webhooks: "/dashboard/webhooks",
};

// Poll at 3s with a 5-minute wall-clock ceiling. The deadline is wall-clock,
// not attempt-count, because a slow status endpoint makes each attempt outlast
// the interval and an attempt count would overshoot the intended bound.
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1_000;
const MAX_POLL_ATTEMPTS = Math.ceil(MAX_POLL_DURATION_MS / POLL_INTERVAL_MS);

/** Thrown when a caller aborts an export via its AbortSignal. */
export class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled.");
    this.name = "ExportCancelledError";
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError();
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ExportCancelledError());
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new ExportCancelledError());
    };

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Create the export job and return its initial status. */
export async function requestDataExport(
  request: DataExportRequest,
): Promise<MerchantExportJobStatus> {
  return api.merchantExports.request({
    resource: request.resource,
    format: request.format,
    filters: request.filters,
  });
}

/** Poll a job until it completes, fails, is aborted, or times out. */
export async function waitForDataExportJob(
  jobId: string,
  options: DataExportOptions = {},
): Promise<MerchantExportJobStatus> {
  const { onProgress, signal } = options;
  const startedAt = Date.now();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    assertNotAborted(signal);

    const job = await api.merchantExports.status(jobId);
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(job.error || "Export job failed.");
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed >= MAX_POLL_DURATION_MS) break;

    onProgress?.(elapsed);
    await wait(POLL_INTERVAL_MS, signal);
  }

  throw new Error(
    "Export timed out after 5 minutes. It may still finish — check back shortly.",
  );
}

/** Fetch a completed job's payload and map it to rows for the resource. */
export async function fetchDataExportRows(
  jobId: string,
  resource: MerchantExportResource,
): Promise<DataExportRow[]> {
  const payload = (await api.merchantExports.download(jobId)) as ExportPayload;
  if (resource === "payments") return payload.payments_summary?.records ?? [];
  if (resource === "webhooks") return payload.webhook_logs_summary?.records ?? [];
  return [];
}

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Serialize rows to CSV.
 *
 * Every field is quoted with embedded quotes doubled, which is the safest
 * shape for values that may contain commas, quotes, or newlines (descriptions
 * and customer emails routinely do).
 */
export function toCsv(
  resource: MerchantExportResource,
  rows: DataExportRow[],
): string {
  const columns = columnsByResource[resource];
  const header = columns.map((column) => column.label);
  const body = rows.map((row) =>
    columns.map((column) => normalizeCell(row[column.key])),
  );

  return [header, ...body]
    .map((cells) =>
      cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}

export function buildExportFilename(
  resource: MerchantExportResource,
  format: MerchantExportFormat,
  date: Date = new Date(),
): string {
  return `${resource}_export_${date.toISOString().slice(0, 10)}.${format}`;
}

/** Trigger a browser download for a CSV string. */
export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function buildNotification(input: {
  resource: MerchantExportResource;
  filename: string;
  rowCount: number;
}): LocalDashboardNotification {
  const { resource, filename, rowCount } = input;
  const noun = resource === "payments" ? "payment" : resource.replace(/s$/, "");

  return publishLocalDashboardNotification({
    category: "export",
    severity: "info",
    title: "Export ready",
    description: `${rowCount.toLocaleString()} ${noun}${
      rowCount === 1 ? "" : "s"
    } exported to ${filename}.`,
    href: resourcePaths[resource],
  });
}

/**
 * Run the full bulk-export flow: request a job, wait for it, download the
 * finished payload, save it as a CSV in the browser, and publish a dashboard
 * notification so the merchant can see the export completed even if they
 * navigated away from the toast.
 */
export async function exportDataToCsv(
  request: DataExportRequest,
  options: DataExportOptions = {},
): Promise<DataExportResult> {
  const job = await requestDataExport({ ...request, format: "csv" });

  await waitForDataExportJob(job.jobId, options);
  assertNotAborted(options.signal);

  const rows = await fetchDataExportRows(job.jobId, request.resource);
  const filename = buildExportFilename(request.resource, "csv");

  downloadCsvFile(filename, toCsv(request.resource, rows));

  const notification = buildNotification({
    resource: request.resource,
    filename,
    rowCount: rows.length,
  });

  return {
    jobId: job.jobId,
    filename,
    rowCount: rows.length,
    completedAt: new Date().toISOString(),
    notification,
  };
}
