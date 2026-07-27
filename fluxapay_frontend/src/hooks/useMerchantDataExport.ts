"use client";

import { useCallback, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import toast from "react-hot-toast";
import {
  api,
  type MerchantExportFormat,
  type MerchantExportResource,
} from "@/lib/api";

type ExportFilters = Record<string, string | number | undefined>;
type ExportRow = Record<string, unknown>;

type ExportOptions = {
  resource: MerchantExportResource;
  format: MerchantExportFormat;
  filters?: ExportFilters;
  page?: number;
  limit?: number;
  fallbackRows?: ExportRow[];
};

type ExportPayload = {
  exported_at?: string;
  payments_summary?: { records?: ExportRow[] };
  webhook_logs_summary?: { records?: ExportRow[] };
};

// #833: 3s interval and a 5-minute ceiling, per the issue. The previous
// 1.5s x 40 attempts gave up after 60 seconds — well inside the time a large
// export legitimately takes, so merchants saw "taking longer than expected"
// on jobs that were still running fine and would have completed.
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1_000;
const MAX_POLL_ATTEMPTS = Math.ceil(MAX_POLL_DURATION_MS / POLL_INTERVAL_MS);

const columnsByResource: Record<
  MerchantExportResource,
  Array<{ key: string; label: string }>
> = {
  payments: [
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
  ],
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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function filterRows(
  rows: ExportRow[],
  resource: MerchantExportResource,
  filters: ExportFilters = {},
) {
  return rows.filter((row) => {
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.currency && filters.currency !== "all" && row.currency !== filters.currency) return false;

    const amount = Number(row.amount ?? row.usdcAmount ?? row.fiatAmount);
    if (filters.amount_min && Number.isFinite(amount) && amount < Number(filters.amount_min)) return false;
    if (filters.amount_max && Number.isFinite(amount) && amount > Number(filters.amount_max)) return false;

    const search = typeof filters.search === "string" ? filters.search.trim().toLowerCase() : "";
    if (search) {
      const searchable = [
        row.id,
        row.customer_email,
        row.description,
        row.transaction_hash,
        row.payment_id,
        row.event_type,
        row.endpoint_url,
        row.bankReference,
      ]
        .map(normalize)
        .join(" ")
        .toLowerCase();
      if (!searchable.includes(search)) return false;
    }

    if (resource === "webhooks" && filters.event_type && filters.event_type !== "all") {
      if (row.event_type !== filters.event_type) return false;
    }

    const rowDate = normalize(row.createdAt ?? row.created_at ?? row.date);
    if (filters.date_from && rowDate) {
      if (new Date(rowDate) < new Date(String(filters.date_from))) return false;
    }
    if (filters.date_to && rowDate) {
      if (new Date(rowDate) > new Date(String(filters.date_to))) return false;
    }

    return true;
  });
}

function applyPageState(rows: ExportRow[], page?: number, limit?: number) {
  if (!page || !limit) return rows;
  const start = (page - 1) * limit;
  return rows.slice(start, start + limit);
}

function rowsFromPayload(
  payload: ExportPayload,
  resource: MerchantExportResource,
  fallbackRows: ExportRow[] = [],
) {
  if (resource === "payments") return payload.payments_summary?.records ?? fallbackRows;
  if (resource === "webhooks") return payload.webhook_logs_summary?.records ?? fallbackRows;
  return fallbackRows;
}

function filename(resource: MerchantExportResource, format: MerchantExportFormat) {
  const date = new Date().toISOString().slice(0, 10);
  return `${resource}_export_${date}.${format}`;
}

function downloadCsv(resource: MerchantExportResource, rows: ExportRow[]) {
  const columns = columnsByResource[resource];
  const csv = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => normalize(row[column.key]))),
  ]
    .map((cells) =>
      cells
        .map((cell) => `"${cell.replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename(resource, "csv");
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function downloadPdf(resource: MerchantExportResource, rows: ExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const columns = columnsByResource[resource];
  const title = `${resource[0].toUpperCase()}${resource.slice(1)} Export`;

  doc.setFontSize(18);
  doc.text(`FluxaPay ${title}`, 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 26);

  autoTable(doc, {
    startY: 34,
    head: [columns.map((column) => column.label)],
    body: rows.map((row) => columns.map((column) => normalize(row[column.key]))),
    theme: "striped",
    headStyles: { fillColor: [46, 53, 57] },
    styles: { fontSize: 8, overflow: "linebreak" },
  });

  doc.save(filename(resource, "pdf"));
}

/**
 * Poll an export job to completion (#833).
 *
 * `onProgress` surfaces elapsed time to the caller so the loading state can
 * say something truthful while waiting, rather than showing an unchanging
 * spinner for up to five minutes.
 *
 * The deadline is wall-clock, not attempt-count: a slow status endpoint makes
 * each attempt take longer than the interval, so counting attempts alone would
 * overshoot the five-minute bound the issue specifies.
 */
export async function waitForExport(
  jobId: string,
  onProgress?: (elapsedMs: number) => void,
) {
  const startedAt = Date.now();

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const job = await api.merchantExports.status(jobId);
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(job.error || "Export job failed.");
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed >= MAX_POLL_DURATION_MS) break;

    onProgress?.(elapsed);
    await wait(POLL_INTERVAL_MS);
  }

  throw new Error(
    "Export timed out after 5 minutes. It may still finish — check your exports shortly.",
  );
}

export function useMerchantDataExport() {
  const [exportingFormat, setExportingFormat] = useState<MerchantExportFormat | null>(null);

  const exportData = useCallback(async (options: ExportOptions) => {
    setExportingFormat(options.format);
    const label = `${options.resource} ${options.format.toUpperCase()}`;
    const toastId = toast.loading(`Preparing ${label} export...`);

    try {
      const job = await api.merchantExports.request({
        resource: options.resource,
        format: options.format,
        filters: options.filters,
        page: options.page,
        limit: options.limit,
      });

      await waitForExport(job.jobId, (elapsedMs) => {
        // Keep the toast honest about the wait instead of an idle spinner.
        const seconds = Math.floor(elapsedMs / 1000);
        toast.loading(`Preparing ${label} export... (${seconds}s)`, { id: toastId });
      });
      const payload = (await api.merchantExports.download(job.jobId)) as ExportPayload;
      const filteredRows = filterRows(
        rowsFromPayload(payload, options.resource, options.fallbackRows),
        options.resource,
        options.filters,
      );
      const rows =
        options.resource === "settlements"
          ? filteredRows
          : applyPageState(filteredRows, options.page, options.limit);

      if (options.format === "csv") {
        downloadCsv(options.resource, rows);
      } else {
        downloadPdf(options.resource, rows);
      }

      toast.success(`${label} downloaded.`, { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed. Please try again.", {
        id: toastId,
      });
    } finally {
      setExportingFormat(null);
    }
  }, []);

  return { exportData, exportingFormat };
}
