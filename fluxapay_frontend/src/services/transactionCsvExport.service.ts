import { api, type PaymentCsvExportResult } from "@/lib/api";

/**
 * Client side of the transaction-history CSV export (#1216).
 *
 * The server streams the file, so there is no job to poll and no whole-file
 * re-serialisation in the browser: the Blob the API returns is handed straight
 * to the download. This module is deliberately free of React so it can be
 * unit tested without a renderer.
 */

export interface TransactionExportFilters {
  status?: string;
  currency?: string;
  search?: string;
  /** Inclusive start of the range, as YYYY-MM-DD. */
  dateFrom?: string;
  /** Inclusive end of the range, as YYYY-MM-DD. */
  dateTo?: string;
  amountMin?: string;
  amountMax?: string;
}

export type DateRangePreset = "all" | "7d" | "30d" | "90d" | "month" | "custom";

export const DATE_RANGE_PRESETS: ReadonlyArray<{ value: DateRangePreset; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

/** Format a Date as the YYYY-MM-DD string the date inputs and API expect. */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolve a preset into concrete from/to bounds. "All time" returns empty
 * strings, which the API treats as "no bound".
 */
export function resolveDateRangePreset(
  preset: DateRangePreset,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = toDateInputValue(now);

  if (preset === "all") return { from: "", to: "" };
  if (preset === "month") {
    return { from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
  if (preset === "custom") return { from: "", to: "" };

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { from: toDateInputValue(start), to };
}

/** Human readable summary of the active range, shown in the export dialog. */
export function describeDateRange(from: string, to: string): string {
  if (!from && !to) return "All time";
  if (from && to) {
    if (from === to) return to;
    return `${from} to ${to}`;
  }
  return from ? `From ${from}` : `Up to ${to}`;
}

/**
 * Validate the range before hitting the API so an inverted or unparseable
 * range fails fast with a message the merchant can act on.
 */
export function validateDateRange(from: string, to: string): string | null {
  const isValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (from && !isValid(from)) return "Start date is not a valid date.";
  if (to && !isValid(to)) return "End date is not a valid date.";
  if (from && to && from > to) return "Start date must be on or before the end date.";
  return null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DownloadTransactionsCsvOptions {
  onProgress?: (elapsedMs: number) => void;
  signal?: AbortSignal;
}

/**
 * Request the CSV and hand it to the browser. Resolves with the row count the
 * server reported so the caller can confirm the export in a toast.
 */
export async function downloadTransactionsCsv(
  filters: TransactionExportFilters,
  options: DownloadTransactionsCsvOptions = {},
): Promise<PaymentCsvExportResult> {
  const startedAt = Date.now();
  const tick = setInterval(() => options.onProgress?.(Date.now() - startedAt), 3000);

  try {
    const result = await api.payments.export(
      {
        status: filters.status,
        currency: filters.currency,
        search: filters.search,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        amount_min: filters.amountMin || undefined,
        amount_max: filters.amountMax || undefined,
      },
      options.signal ? { signal: options.signal } : undefined,
    );

    if ("error" in result) {
      throw new Error(result.error.message);
    }

    triggerDownload(result.data.blob, result.data.filename);
    return result.data;
  } finally {
    clearInterval(tick);
  }
}
