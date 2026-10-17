/**
 * Parsing and presentation helpers for the Settings › Webhooks delivery log
 * (issue #1256). Kept free of React so they can be unit-tested directly.
 */

export type DeliveryBadge = "success" | "failed" | "retrying" | "pending";

export interface WebhookLogRow {
  id: string;
  eventType: string;
  endpointUrl: string;
  /** HTTP status of the last attempt, or null when no response arrived. */
  httpStatus: number | null;
  status: string;
  paymentId: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  /** Delivery latency in ms, when the backend reports it. */
  durationMs: number | null;
}

export interface WebhookLogAttempt {
  attemptNumber: number;
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  timestamp: string;
}

export interface WebhookLogDetail extends WebhookLogRow {
  requestPayload: unknown;
  requestHeaders: Record<string, string> | null;
  responseBody: string | null;
  maxRetries: number | null;
  nextRetryAt: string | null;
  attempts: WebhookLogAttempt[];
}

export interface WebhookLogPage {
  rows: WebhookLogRow[];
  page: number;
  totalPages: number;
  total: number;
}

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * The API wraps payloads as `{ message, data: {...} }`; `fetchWithAuth`
 * returns that whole body. Accept both the wrapped and unwrapped shape.
 */
function unwrap(body: unknown): Raw {
  const outer = asRecord(body);
  const inner = asRecord(outer.data);
  return Object.keys(inner).length > 0 ? inner : outer;
}

export function parseLogRow(raw: unknown): WebhookLogRow {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    eventType: str(r.event_type, "unknown"),
    endpointUrl: str(r.endpoint_url),
    httpStatus: num(r.http_status),
    status: str(r.status, "pending"),
    paymentId: r.payment_id == null ? null : str(r.payment_id),
    retryCount: num(r.retry_count) ?? 0,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at ?? r.created_at),
    durationMs: num(r.duration_ms ?? r.latency_ms ?? r.response_time_ms),
  };
}

export function parseLogPage(body: unknown, requestedPage: number, limit: number): WebhookLogPage {
  const data = unwrap(body);
  const logs = Array.isArray(data.logs) ? data.logs : [];
  const pagination = asRecord(data.pagination);
  const total = num(pagination.total) ?? logs.length;
  const totalPages = num(pagination.total_pages) ?? Math.max(1, Math.ceil(total / Math.max(1, limit)));
  return {
    rows: logs.map(parseLogRow),
    page: num(pagination.page) ?? requestedPage,
    totalPages: Math.max(1, totalPages),
    total,
  };
}

function parseHeaders(value: unknown): Record<string, string> | null {
  const r = asRecord(value);
  const entries = Object.entries(r).filter(([, v]) => v != null);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.map(([k, v]) => [k, str(v)]));
}

export function parseLogDetail(body: unknown): WebhookLogDetail {
  const d = unwrap(body);
  const attempts = Array.isArray(d.retry_attempts) ? d.retry_attempts : [];
  return {
    ...parseLogRow(d),
    requestPayload: d.request_payload ?? null,
    requestHeaders: parseHeaders(d.request_headers ?? d.headers),
    responseBody: d.response_body == null ? null : str(d.response_body),
    maxRetries: num(d.max_retries),
    nextRetryAt: d.next_retry_at == null ? null : str(d.next_retry_at),
    attempts: attempts.map((a) => {
      const r = asRecord(a);
      return {
        attemptNumber: num(r.attempt_number) ?? 0,
        httpStatus: num(r.http_status),
        responseBody: r.response_body == null ? null : str(r.response_body),
        errorMessage: r.error_message == null ? null : str(r.error_message),
        timestamp: str(r.timestamp ?? r.created_at),
      };
    }),
  };
}

/** Map a backend delivery status to the badge shown in the table. */
export function deliveryBadge(status: string): DeliveryBadge {
  switch (status) {
    case "delivered":
      return "success";
    case "failed":
    case "permanently_failed":
      return "failed";
    case "retrying":
      return "retrying";
    default:
      return "pending";
  }
}

export const BADGE_LABEL: Record<DeliveryBadge, string> = {
  success: "Success",
  failed: "Failed",
  retrying: "Retrying",
  pending: "Pending",
};

export const BADGE_VARIANT: Record<DeliveryBadge, "success" | "error" | "warning" | "info"> = {
  success: "success",
  failed: "error",
  retrying: "warning",
  pending: "info",
};

/** "200", "500", or "Timeout" when the endpoint never answered. */
export function formatHttpStatus(row: Pick<WebhookLogRow, "httpStatus" | "status">): string {
  if (row.httpStatus != null && row.httpStatus > 0) return String(row.httpStatus);
  return row.status === "pending" ? "—" : "Timeout";
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Pretty-print a JSON value or a string that contains JSON. */
export function formatJson(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Headers FluxaPay sends with every delivery. Shown when the backend did not
 * record the exact headers of an attempt (it stores payload and response only).
 */
export const STANDARD_DELIVERY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "X-FluxaPay-Signature": "HMAC-SHA256 of `${timestamp}.${body}` (not stored)",
  "X-FluxaPay-Timestamp": "ISO 8601 delivery timestamp (not stored)",
};
