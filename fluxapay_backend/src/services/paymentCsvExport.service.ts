import { prisma } from "../config/prisma";

/**
 * Streaming CSV export for a merchant's transaction history (#1216).
 *
 * The previous implementation loaded every matching payment into memory and
 * sent one giant string, which timed out for merchants with a large history.
 * This service walks the result set in fixed-size batches (keyset pagination on
 * `createdAt` + `id`, which is fully covered by the existing
 * `@@index([merchantId, is_test_mode, createdAt(sort: Desc)])` indexes) and
 * writes each batch straight to the response, so memory stays O(batch size)
 * regardless of how many transactions the merchant has.
 */

/** Rows fetched per database round trip. */
export const PAYMENT_CSV_BATCH_SIZE = 500;

/** Hard cap so a single request can never stream an unbounded file forever. */
export const PAYMENT_CSV_MAX_ROWS = 50_000;

/** Columns exported for every payment, in order. */
export const PAYMENT_CSV_COLUMNS = [
  "payment_id",
  "merchant_id",
  "status",
  "amount",
  "currency",
  "paid_amount",
  "usdc_amount",
  "fx_rate",
  "customer_id",
  "customer_email",
  "customer_name",
  "customer_phone",
  "customer_stellar_address",
  "description",
  "note",
  "metadata",
  "created_at",
  "confirmed_at",
  "settled_at",
  "expires_at",
  "transaction_hash",
  "contract_tx_hash",
  "sweep_tx_hash",
  "payer_address",
  "stellar_address",
  "payment_index",
  "onchain_verified",
  "checkout_url",
  "success_url",
  "cancel_url",
  "payment_link_id",
  "settlement_id",
  "settlement_ref",
  "settlement_fiat_amount",
  "settlement_fiat_currency",
  "swept",
  "settled",
  "swept_at",
  "webhook_status",
  "webhook_retries",
  "is_test_mode",
] as const;

export type PaymentCsvColumn = (typeof PAYMENT_CSV_COLUMNS)[number];

const CSV_HEADER = PAYMENT_CSV_COLUMNS.join(",");

/** Matches cells that are unambiguously numeric, so they never need escaping. */
const NUMERIC_CELL = /^-?\d+(?:\.\d+)?$/;

/** Leading characters a spreadsheet treats as the start of a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const NEEDS_QUOTING = /[",\r\n]/;

/**
 * Escape one CSV cell (RFC 4180) and neutralise spreadsheet formula injection
 * by prefixing a single quote to user-controlled values that a spreadsheet
 * would otherwise evaluate. Purely numeric cells are left alone so that
 * negative amounts and high-precision decimals survive the round trip.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();

  const raw = String(value);
  if (raw === "") return "";

  const sanitised =
    typeof value === "string" && !NUMERIC_CELL.test(raw) && FORMULA_PREFIX.test(raw)
      ? `'${raw}`
      : raw;

  if (NEEDS_QUOTING.test(sanitised)) {
    return `"${sanitised.replace(/"/g, '""')}"`;
  }
  return sanitised;
}

/** Join already-escaped cells into one CSV record terminated by CRLF. */
export function toCsvRecord(cells: readonly string[]): string {
  return `${cells.join(",")}\r\n`;
}

/** Thrown when `date_from` / `date_to` cannot be parsed as a date. */
export class InvalidExportDateError extends Error {
  constructor(param: string) {
    super(`Invalid ${param} value. Expected an ISO date (YYYY-MM-DD) or date-time.`);
    this.name = "InvalidExportDateError";
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse an export date-range bound. Bare `YYYY-MM-DD` values are anchored to
 * the start of the day for `date_from` and the very end of the day for
 * `date_to`, so "to: 2026-03-04" includes everything that happened on the 4th
 * instead of cutting the day off at 00:00:00Z.
 */
export function parseExportDateBound(
  raw: unknown,
  bound: "from" | "to",
): Date | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;

  const value = String(raw).trim();
  // Reject anything Date cannot parse (e.g. "not-a-date") rather than letting
  // it silently become Invalid Date and produce a nonsense range.
  const parsed = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidExportDateError(bound === "from" ? "date_from" : "date_to");
  }

  if (!DATE_ONLY.test(value)) return parsed;

  if (bound === "from") return parsed;
  return new Date(parsed.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export interface PaymentCsvExportFilters {
  merchantId: string;
  isTestMode?: boolean;
  status?: string;
  currency?: string;
  search?: string;
  amountMin?: number;
  amountMax?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Translate the export query params into a Prisma `where` clause. The
 * live/test partition mirrors the list endpoint so an API-key export can never
 * leak rows from the other partition.
 */
export function buildPaymentExportWhere(
  filters: PaymentCsvExportFilters,
): Record<string, unknown> {
  const {
    merchantId,
    isTestMode,
    status,
    currency,
    search,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
  } = filters;

  const amountRange =
    amountMin !== undefined || amountMax !== undefined
      ? {
          ...(amountMin !== undefined && { gte: amountMin }),
          ...(amountMax !== undefined && { lte: amountMax }),
        }
      : undefined;

  return {
    merchantId,
    ...(typeof isTestMode === "boolean" && { is_test_mode: isTestMode }),
    ...(status && { status }),
    ...(currency && { currency }),
    ...(amountRange && { amount: amountRange }),
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    }),
    ...(search && {
      OR: [
        { id: { contains: search } },
        { customer_email: { contains: search, mode: "insensitive" } },
      ],
    }),
  };
}

/** Read the amount bounds from the query, ignoring values that are not numbers. */
export function parseAmountBound(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

/** Attachment filename, e.g. `transactions_2026-03-04.csv`. */
export function buildPaymentExportFilename(now: Date = new Date()): string {
  return `transactions_${now.toISOString().slice(0, 10)}.csv`;
}

/** The payment columns the exporter reads, mirrored by EXPORT_SELECT. */
export type PaymentExportRow = {
  id: string;
  merchantId: string;
  status: string;
  amount: unknown;
  currency: string;
  paid_amount: unknown;
  usdc_amount: unknown;
  fx_rate: unknown;
  customerId: string | null;
  customer_email: string;
  customer: { id: string; name: string | null; phone: string | null; stellar_address: string | null } | null;
  description: string | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
  confirmed_at: Date | null;
  settled_at: Date | null;
  expiration: Date;
  transaction_hash: string | null;
  contract_tx_hash: string | null;
  sweep_tx_hash: string | null;
  payer_address: string | null;
  stellar_address: string | null;
  payment_index: number | null;
  onchain_verified: boolean | null;
  checkout_url: string;
  success_url: string | null;
  cancel_url: string | null;
  paymentLinkId: string | null;
  settlementId: string | null;
  settlement_ref: string | null;
  settlement_fiat_amount: unknown;
  settlement_fiat_currency: string | null;
  swept: boolean;
  settled: boolean;
  swept_at: Date | null;
  webhook_status: string;
  webhook_retries: number;
  is_test_mode: boolean;
};

const EXPORT_SELECT = {
  id: true,
  merchantId: true,
  status: true,
  amount: true,
  currency: true,
  paid_amount: true,
  usdc_amount: true,
  fx_rate: true,
  customerId: true,
  customer_email: true,
  customer: { select: { id: true, name: true, phone: true, stellar_address: true } },
  description: true,
  note: true,
  metadata: true,
  createdAt: true,
  confirmed_at: true,
  settled_at: true,
  expiration: true,
  transaction_hash: true,
  contract_tx_hash: true,
  sweep_tx_hash: true,
  payer_address: true,
  stellar_address: true,
  payment_index: true,
  onchain_verified: true,
  checkout_url: true,
  success_url: true,
  cancel_url: true,
  paymentLinkId: true,
  settlementId: true,
  settlement_ref: true,
  settlement_fiat_amount: true,
  settlement_fiat_currency: true,
  swept: true,
  settled: true,
  swept_at: true,
  webhook_status: true,
  webhook_retries: true,
  is_test_mode: true,
} as const;

/** Serialise a payment record into the ordered CSV cells for its row. */
export function paymentToCsvCells(payment: PaymentExportRow): string[] {
  const metadata =
    payment.metadata === null || payment.metadata === undefined
      ? ""
      : JSON.stringify(payment.metadata);

  return [
    payment.id,
    payment.merchantId,
    payment.status,
    payment.amount,
    payment.currency,
    payment.paid_amount,
    payment.usdc_amount,
    payment.fx_rate,
    payment.customerId ?? payment.customer?.id ?? "",
    payment.customer_email,
    payment.customer?.name ?? "",
    payment.customer?.phone ?? "",
    payment.customer?.stellar_address ?? "",
    payment.description,
    payment.note,
    metadata,
    payment.createdAt,
    payment.confirmed_at,
    payment.settled_at,
    payment.expiration,
    payment.transaction_hash,
    payment.contract_tx_hash,
    payment.sweep_tx_hash,
    payment.payer_address,
    payment.stellar_address,
    payment.payment_index,
    payment.onchain_verified,
    payment.checkout_url,
    payment.success_url,
    payment.cancel_url,
    payment.paymentLinkId,
    payment.settlementId,
    payment.settlement_ref,
    payment.settlement_fiat_amount,
    payment.settlement_fiat_currency,
    payment.swept,
    payment.settled,
    payment.swept_at,
    payment.webhook_status,
    payment.webhook_retries,
    payment.is_test_mode,
  ].map(escapeCsvCell);
}

/** Minimal writable surface so the exporter can be unit tested without a socket. */
export interface CsvStreamSink {
  write(chunk: string): boolean;
  once(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
  end(): void;
  /** Set by Node once the underlying socket/stream is torn down. */
  destroyed?: boolean;
}

/** Raised when the client disconnects mid-export; the caller should stop quietly. */
export class ExportClientDisconnectedError extends Error {
  constructor() {
    super("Client disconnected during CSV export");
    this.name = "ExportClientDisconnectedError";
  }
}

/** Await stream drain so a slow client throttles the query loop instead of buffering. */
function writeWithBackpressure(sink: CsvStreamSink, chunk: string): Promise<void> {
  if (sink.write(chunk)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      sink.off("drain", onDrain);
      sink.off("close", onClose);
      sink.off("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new ExportClientDisconnectedError());
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    sink.once("drain", onDrain);
    sink.once("close", onClose);
    sink.once("error", onError);
  });
}

export interface StreamPaymentsCsvResult {
  /** Rows actually written to the CSV. */
  rowCount: number;
  /** Rows matching the filter before the cap, from the pre-flight count. */
  totalMatched: number;
  /** True when the cap stopped the export before every match was written. */
  truncated: boolean;
}

export interface StreamPaymentsCsvOptions {
  filters: PaymentCsvExportFilters;
  sink: CsvStreamSink;
  batchSize?: number;
  maxRows?: number;
  /**
   * Invoked once, after the pre-flight count and before the first byte is
   * written, so the caller can still set response headers.
   */
  onStart?: (totalMatched: number, truncated: boolean) => void;
}

/**
 * Write the CSV header, then stream every matching payment in batches. Rows are
 * ordered chronologically (createdAt, then id) so the file is deterministic and
 * the keyset cursor can never skip or repeat a row.
 */
export async function streamPaymentsCsv(
  options: StreamPaymentsCsvOptions,
): Promise<StreamPaymentsCsvResult> {
  const {
    filters,
    sink,
    batchSize = PAYMENT_CSV_BATCH_SIZE,
    maxRows = PAYMENT_CSV_MAX_ROWS,
    onStart,
  } = options;

  const where = buildPaymentExportWhere(filters);

  const totalMatched = await prisma.payment.count({ where });
  const truncated = totalMatched > maxRows;

  onStart?.(totalMatched, truncated);

  await writeWithBackpressure(sink, toCsvRecord([CSV_HEADER]));

  let rowCount = 0;
  let cursor: { createdAt: Date; id: string } | undefined;
  let batch: PaymentExportRow[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const chunk = batch.map((p) => toCsvRecord(paymentToCsvCells(p))).join("");
    batch = [];
    await writeWithBackpressure(sink, chunk);
  };

  while (rowCount < maxRows) {
    // Stop querying entirely once the client is gone.
    if (sink.destroyed) throw new ExportClientDisconnectedError();

    const remaining = maxRows - rowCount;
    const take = Math.min(batchSize, remaining);

    // Keyset pagination: restrict the window to rows strictly after the last
    // one already written, using (createdAt, id) as the composite key. Unlike
    // offset pagination this stays O(batch) per page no matter how deep the
    // export goes, and cannot skip or repeat a row.
    const pagedWhere: Record<string, unknown> = cursor
      ? {
          AND: [
            where,
            {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            },
          ],
        }
      : where;

    batch = (await prisma.payment.findMany({
      where: pagedWhere,
      select: EXPORT_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
    })) as PaymentExportRow[];

    if (batch.length === 0) break;

    const last = batch[batch.length - 1];
    const fetched = batch.length;

    await flush();
    rowCount += fetched;
    cursor = { createdAt: last.createdAt, id: last.id };

    if (fetched < take) break;
  }

  await flush();
  sink.end();

  return { rowCount, totalMatched, truncated };
}
