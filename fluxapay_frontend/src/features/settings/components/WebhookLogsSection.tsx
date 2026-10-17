"use client";

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, History, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Spinner } from "./Spinner";
import {
  BADGE_LABEL,
  BADGE_VARIANT,
  STANDARD_DELIVERY_HEADERS,
  deliveryBadge,
  formatDuration,
  formatHttpStatus,
  formatJson,
  parseLogDetail,
  parseLogPage,
  type WebhookLogDetail,
  type WebhookLogRow,
} from "./webhookLogs";

export const WEBHOOK_LOGS_PAGE_SIZE = 10;

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso || "—" : d.toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const badge = deliveryBadge(status);
  return (
    <Badge variant={BADGE_VARIANT[badge]} data-testid="webhook-status-badge">
      {BADGE_LABEL[badge]}
    </Badge>
  );
}

function CodeBlock({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <section className="space-y-1">
      <h4 className="text-sm font-semibold">{label}</h4>
      <pre
        className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed"
        tabIndex={0}
        aria-label={label}
      >
        {value || <span className="text-muted-foreground">{empty}</span>}
      </pre>
    </section>
  );
}

interface DetailModalProps {
  row: WebhookLogRow | null;
  onClose: () => void;
  onResent: () => void;
}

/** Event inspection modal: payload, headers, response and a resend action. */
export function WebhookLogDetailModal({ row, onClose, onResent }: DetailModalProps) {
  const [detail, setDetail] = useState<WebhookLogDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!row) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api.webhooks.logDetails(row.id).then((res) => {
      if (cancelled) return;
      if ("error" in res) {
        setError(res.error.message || "Failed to load delivery details");
      } else {
        setDetail(parseLogDetail(res.data));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [row]);

  const handleResend = async () => {
    if (!row) return;
    setResending(true);
    const res = await api.webhooks.retry(row.id);
    setResending(false);
    if ("error" in res) {
      toast.error(res.error.message || "Failed to resend webhook");
      return;
    }
    toast.success("Webhook resent — a new delivery attempt was queued");
    onResent();
  };

  const shown = detail ?? (row ? { ...row } : null);
  const headers = detail?.requestHeaders ?? STANDARD_DELIVERY_HEADERS;

  return (
    <Modal isOpen={!!row} onClose={onClose} title="Webhook delivery">
      {shown && (
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1" data-testid="webhook-log-detail">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Event</dt>
              <dd className="font-medium break-all">{shown.eventType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={shown.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">HTTP</dt>
              <dd className="font-mono">{formatHttpStatus(shown)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duration</dt>
              <dd className="font-mono">{formatDuration(shown.durationMs)}</dd>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-muted-foreground">Endpoint</dt>
              <dd className="font-mono text-xs break-all">{shown.endpointUrl || "—"}</dd>
            </div>
          </dl>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner /> Loading delivery details…
            </div>
          )}
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}

          {detail && (
            <>
              <CodeBlock
                label="Request payload"
                value={formatJson(detail.requestPayload)}
                empty="No payload recorded"
              />
              <section className="space-y-1">
                <h4 className="text-sm font-semibold">Request headers</h4>
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(headers).map(([name, value]) => (
                      <tr key={name} className="border-b last:border-0">
                        <th scope="row" className="py-1 pr-3 text-left font-mono font-medium align-top">
                          {name}
                        </th>
                        <td className="py-1 font-mono break-all">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <CodeBlock
                label="Response body"
                value={formatJson(detail.responseBody)}
                empty="No response body (the endpoint did not answer)"
              />

              {detail.attempts.length > 0 && (
                <section className="space-y-1">
                  <h4 className="text-sm font-semibold">Attempts</h4>
                  <ol className="space-y-1 text-xs">
                    {detail.attempts.map((a) => (
                      <li key={`${a.attemptNumber}-${a.timestamp}`} className="flex flex-wrap gap-x-3">
                        <span className="font-medium">#{a.attemptNumber}</span>
                        <span>{formatTimestamp(a.timestamp)}</span>
                        <span className="font-mono">{a.httpStatus ?? "no response"}</span>
                        {a.errorMessage && <span className="text-red-500">{a.errorMessage}</span>}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={handleResend} disabled={resending} className="gap-2">
              {resending ? <Spinner /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Resend Webhook
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * "Webhook Logs" section of Settings › Webhooks (issue #1256): paginated
 * delivery history with status badges, opening an inspection modal per event.
 */
export function WebhookLogsSection() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WebhookLogRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WebhookLogRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);
    const res = await api.webhooks.logs({ page: requestedPage, limit: WEBHOOK_LOGS_PAGE_SIZE });
    if ("error" in res) {
      setError(res.error.message || "Failed to load webhook logs");
      setRows([]);
    } else {
      const parsed = parseLogPage(res.data, requestedPage, WEBHOOK_LOGS_PAGE_SIZE);
      setRows(parsed.rows);
      setTotalPages(parsed.totalPages);
      setTotal(parsed.total);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page, refreshKey]);

  return (
    <section className="space-y-4 p-6 rounded-2xl border bg-muted/20" aria-labelledby="webhook-logs-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <History className="h-5 w-5" aria-hidden="true" />
          <h3 id="webhook-logs-heading" className="text-lg">
            Webhook Logs
          </h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}{" "}
          <button type="button" className="underline" onClick={() => setRefreshKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full text-sm" aria-busy={loading}>
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2">Event</th>
                <th scope="col" className="px-4 py-2">Timestamp</th>
                <th scope="col" className="px-4 py-2">Status</th>
                <th scope="col" className="px-4 py-2">HTTP</th>
                <th scope="col" className="px-4 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground" role="status">
                    Loading webhook deliveries…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No webhook deliveries yet. Events appear here once FluxaPay sends one to your endpoint.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t hover:bg-muted/30 focus-within:bg-muted/30"
                  onClick={() => setSelected(row)}
                >
                  <td className="px-4 py-2 font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(row);
                      }}
                      aria-label={`View delivery ${row.eventType} at ${formatTimestamp(row.createdAt)}`}
                    >
                      {row.eventType}
                    </button>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatTimestamp(row.createdAt)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2 font-mono">{formatHttpStatus(row)}</td>
                  <td className="px-4 py-2 font-mono">{formatDuration(row.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex items-center justify-between text-sm" aria-label="Webhook log pages">
        <span className="text-muted-foreground">
          {total} deliver{total === 1 ? "y" : "ies"} · page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={loading || page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </nav>

      <WebhookLogDetailModal
        row={selected}
        onClose={() => setSelected(null)}
        onResent={() => setRefreshKey((k) => k + 1)}
      />
    </section>
  );
}
