"use client";

import { useEffect, useState, useCallback } from "react";
import { Payment, WebhookLogEntry, StatusHistoryEntry } from "./types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { TxHashLink } from "@/components/TxHashLink";
import {
  X,
  Copy,
  User,
  CreditCard,
  Clock,
  Webhook,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

interface PaymentDrawerProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
}

function StatusBadgeInline({ status }: { status: string }) {
  switch (status) {
    case "confirmed":
      return <Badge variant="success">Confirmed</Badge>;
    case "paid":
      return <Badge variant="success">Paid</Badge>;
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "partially_paid":
      return (
        <Badge className="border-transparent bg-orange-500/10 text-orange-500">
          Partially Paid
        </Badge>
      );
    case "overpaid":
      return <Badge variant="info">Overpaid</Badge>;
    case "failed":
      return <Badge variant="error">Failed</Badge>;
    case "expired":
      return <Badge variant="secondary">Expired</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function TimelineItem({
  entry,
  isLast,
}: {
  entry: StatusHistoryEntry;
  isLast: boolean;
}) {
  const colorMap: Record<string, string> = {
    confirmed: "bg-green-500 ring-green-500/20",
    paid: "bg-green-500 ring-green-500/20",
    completed: "bg-green-500 ring-green-500/20",
    pending: "bg-yellow-500 ring-yellow-500/20",
    partially_paid: "bg-orange-500 ring-orange-500/20",
    overpaid: "bg-blue-500 ring-blue-500/20",
    failed: "bg-red-500 ring-red-500/20",
    expired: "bg-muted-foreground/50 ring-muted-foreground/10",
  };

  const dotClass = colorMap[entry.status] ?? "bg-primary ring-primary/20";

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`h-3 w-3 rounded-full ${dotClass} ring-4 shrink-0`} />
        {!isLast && <div className="h-full w-0.5 bg-border" />}
      </div>
      <div className="pb-4 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium capitalize">{entry.status.replace(/_/g, " ")}</p>
          <StatusBadgeInline status={entry.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(entry.timestamp).toLocaleString()}
        </p>
        {entry.note && (
          <p className="text-xs text-muted-foreground mt-1">{entry.note}</p>
        )}
      </div>
    </div>
  );
}

function WebhookLogRow({ log }: { log: WebhookLogEntry }) {
  const statusIcon =
    log.status === "success" ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : log.status === "failed" ? (
      <XCircle className="h-4 w-4 text-red-500" />
    ) : (
      <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
    );

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        {statusIcon}
        <div className="min-w-0">
          <p className="font-medium truncate">{log.event_type}</p>
          <p className="text-muted-foreground truncate">
            {log.endpoint_url}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono">
          {log.http_status ? `HTTP ${log.http_status}` : "—"}
        </p>
        <p className="text-muted-foreground">
          Attempt {log.attempt} • {new Date(log.created_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

export function PaymentDrawer({ payment, isOpen, onClose }: PaymentDrawerProps) {
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogEntry[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Unable to copy.");
    }
  }, []);

  // Fetch webhook logs when a payment is selected
  useEffect(() => {
    if (!payment || !isOpen) return;

    // Use embedded logs if available
    if (payment.webhookLogs?.length) {
      setWebhookLogs(payment.webhookLogs);
    } else {
      setWebhookLoading(true);
      api.webhooks
        .logs({ search: payment.id, limit: 20 })
        .then((res: unknown) => {
          const data = res as { data?: WebhookLogEntry[] };
          setWebhookLogs(data.data ?? []);
        })
        .catch(() => {
          setWebhookLogs([]);
        })
        .finally(() => setWebhookLoading(false));
    }

    // Use embedded status history or build from payment data
    if (payment.statusHistory?.length) {
      setStatusHistory(payment.statusHistory);
    } else {
      const history: StatusHistoryEntry[] = [
        {
          status: "pending",
          timestamp: payment.createdAt,
          note: "Payment created",
        },
      ];
      if (
        payment.status !== "pending" &&
        payment.status !== "expired" &&
        payment.status !== "failed"
      ) {
        history.push({
          status: payment.status,
          timestamp: payment.createdAt, // Approximation
          note: `Status changed to ${payment.status}`,
        });
      }
      if (payment.status === "expired") {
        history.push({ status: "expired", timestamp: payment.createdAt });
      }
      if (payment.status === "failed") {
        history.push({ status: "failed", timestamp: payment.createdAt });
      }
      setStatusHistory(history);
    }
  }, [payment, isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !payment) return null;

  const fiatDisplay =
    payment.fiatEquivalent != null && payment.fiatCurrency
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: payment.fiatCurrency,
        }).format(payment.fiatEquivalent)
      : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Payment details for ${payment.id}`}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-card border-l shadow-2xl animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">Payment Details</h2>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {payment.id}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            aria-label="Close drawer"
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Amount & Status */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Amount
              </p>
              <p className="text-2xl font-bold">
                {payment.amount.toLocaleString()} {payment.currency}
              </p>
              {fiatDisplay && (
                <p className="text-sm text-muted-foreground">≈ {fiatDisplay}</p>
              )}
            </div>
            <StatusBadgeInline status={payment.status} />
          </div>

          {/* Customer Details */}
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 font-semibold text-primary text-sm">
              <User className="h-4 w-4" />
              Customer Details
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium break-all">{payment.customerEmail || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium">{payment.customerName || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Order ID</p>
                <code className="text-xs bg-muted px-2 py-0.5 rounded">
                  {payment.orderId || "—"}
                </code>
              </div>
            </div>
          </div>

          {/* Transaction Info */}
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 font-semibold text-primary text-sm">
              <CreditCard className="h-4 w-4" />
              Transaction Info
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Charge ID</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono">{payment.id}</code>
                  <button
                    onClick={() => void copyToClipboard(payment.id)}
                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                    aria-label="Copy charge ID"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {payment.depositAddress && (
                <div>
                  <p className="text-xs text-muted-foreground">Deposit Address</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono truncate max-w-[200px]">
                      {payment.depositAddress}
                    </code>
                    <button
                      onClick={() => void copyToClipboard(payment.depositAddress)}
                      className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Copy deposit address"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
              {payment.txHash && (
                <div>
                  <p className="text-xs text-muted-foreground">Stellar TX Hash</p>
                  <TxHashLink
                    txHash={payment.txHash}
                    stellarExpertUrl={payment.stellarExpertUrl}
                    showCopy
                    truncateStart={16}
                    truncateEnd={6}
                  />
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Created At</p>
                <p className="font-medium">
                  {new Date(payment.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-primary text-sm">
              <Clock className="h-4 w-4" />
              Status Timeline
            </div>
            <div className="space-y-0">
              {statusHistory.map((entry, i) => (
                <TimelineItem
                  key={`${entry.status}-${entry.timestamp}-${i}`}
                  entry={entry}
                  isLast={i === statusHistory.length - 1}
                />
              ))}
            </div>
          </div>

          {/* Webhook Delivery Log */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-primary text-sm">
              <Webhook className="h-4 w-4" />
              Webhook Delivery Log
            </div>
            {webhookLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading webhook logs...
              </div>
            ) : webhookLogs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-6">
                <AlertCircle className="h-6 w-6 opacity-40" />
                <p>No webhook deliveries recorded.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {webhookLogs.map((log) => (
                  <WebhookLogRow key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>

          {/* Open in Explorer */}
          {payment.txHash && (
            <div className="pt-2">
              <Button
                className="w-full gap-2"
                onClick={() => {
                  const url =
                    payment.stellarExpertUrl ??
                    (payment.txHash
                      ? `https://stellar.expert/explorer/public/tx/${payment.txHash}`
                      : null);
                  if (url) window.open(url, "_blank");
                }}
              >
                <ExternalLink className="h-4 w-4" />
                View on Stellar Expert
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
