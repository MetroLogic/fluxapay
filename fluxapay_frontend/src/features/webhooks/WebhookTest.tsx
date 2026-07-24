import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { Input } from "@/components/Input";
import { useState } from "react";
import { Send, CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronUp, Copy } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";
import { api } from "@/lib/api";
import { DOCS_URLS } from "@/lib/docs";
import { isValidHttpsWebhookUrl } from "@/lib/webhookUrl";

interface WebhookTestProps {
  isOpen: boolean;
  onClose: () => void;
}

function snippet(text: string, max = 400) {
  const t = text?.trim() ?? "";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

// HMAC verification code snippet shown alongside the test result
const HMAC_SNIPPET = `// Node.js — verify X-FluxaPay-Signature
const crypto = require('crypto');

function verifySignature(rawBody, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)          // raw request body (Buffer/string)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}`;

export const WebhookTest = ({ isOpen, onClose }: WebhookTestProps) => {
  const [eventType, setEventType] = useState("payment_completed");
  const [endpoint, setEndpoint] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [deliveryLogId, setDeliveryLogId] = useState<string | null>(null);
  const [showSnippet, setShowSnippet] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status: number;
    detail: string;
    bodySnippet?: string;
    /** X-FluxaPay-Signature header value sent with the request */
    hmacSignature?: string;
    /** Round-trip latency in milliseconds */
    latencyMs?: number;
    /** Reason string when delivery fails */
    errorReason?: string;
  } | null>(null);

  const getMockPayload = (type: string) => {
    switch (type) {
      case "payment_completed":
        return {
          event_type: "payment_completed",
          data: {
            paymentId: "pay_test_123",
            amount: 500,
            currency: "USDC",
            status: "confirmed",
          },
        };
      case "payment_failed":
        return {
          event_type: "payment_failed",
          data: {
            paymentId: "pay_test_456",
            amount: 100,
            currency: "XLM",
            status: "failed",
            reason: "insufficient_funds",
          },
        };
      case "refund_completed":
        return {
          event_type: "refund_completed",
          data: {
            refundId: "rf_test_789",
            paymentId: "pay_test_123",
            amount: 50,
            currency: "USDC",
            status: "completed",
          },
        };
      default:
        return { event_type: type, data: {} };
    }
  };

  const urlCheck = isValidHttpsWebhookUrl(endpoint);
  const urlError = endpoint.trim() ? (urlCheck.ok ? "" : urlCheck.message) : "";

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(HMAC_SNIPPET);
      toast.success("Code snippet copied.");
    } catch {
      toast.error("Unable to copy.");
    }
  };

  /** Parse the API response into our test result shape */
  function parseResponse(res: {
    data?: {
      id?: string;
      http_status?: number;
      response_body?: string;
      status?: string;
      signature?: string;
      latency_ms?: number;
      error_reason?: string;
    };
  }) {
    const httpStatus = Number(res?.data?.http_status ?? 0);
    const ok = httpStatus >= 200 && httpStatus < 300;
    const bodyRaw =
      typeof res?.data?.response_body === "string" ? res.data.response_body : "";

    setDeliveryLogId(res?.data?.id ?? null);
    setTestResult({
      ok,
      status: httpStatus,
      detail: res?.data?.status ? String(res.data.status) : ok ? "delivered" : "failed",
      bodySnippet: bodyRaw ? snippet(bodyRaw) : undefined,
      hmacSignature: res?.data?.signature ?? undefined,
      latencyMs: res?.data?.latency_ms ?? undefined,
      errorReason: !ok && res?.data?.error_reason ? String(res.data.error_reason) : undefined,
    });

    if (ok) {
      toast.success("Test webhook delivered. Verify the signature on your server.");
    } else {
      toast.error(`Test webhook returned HTTP ${httpStatus || "error"}.`);
    }
  }

  const handleTest = async () => {
    if (!urlCheck.ok) {
      toast.error(urlCheck.message);
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setDeliveryLogId(null);

    try {
      const res = (await api.webhooks.sendTest({
        event_type: eventType,
        endpoint_url: endpoint.trim(),
      })) as Parameters<typeof parseResponse>[0];
      parseResponse(res);
    } catch (e) {
      toastApiError(e);
      setTestResult({
        ok: false,
        status: 0,
        detail: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRetry = async () => {
    if (!deliveryLogId) return;
    setIsRetrying(true);
    try {
      const res = (await api.webhooks.retry(deliveryLogId)) as Parameters<typeof parseResponse>[0];
      parseResponse(res);
      toast.success("Delivery re-queued.");
    } catch (e) {
      toastApiError(e);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Test Webhook Configuration">
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Send a signed test request to your HTTPS endpoint. Compare with{" "}
          <Link
            href={DOCS_URLS.WEBHOOK_VERIFICATION}
            className="text-primary underline font-medium"
            target="_blank"
            rel="noreferrer"
          >
            Webhook signature verification
          </Link>{" "}
          in the docs to validate the payload.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Event Type</label>
            <Select
              className="w-full"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              <option value="payment_completed">payment_completed</option>
              <option value="payment_failed">payment_failed</option>
              <option value="payment_pending">payment_pending</option>
              <option value="refund_completed">refund_completed</option>
              <option value="refund_failed">refund_failed</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Test endpoint URL (HTTPS only)</label>
            <Input
              placeholder="https://your-domain.com/webhooks/fluxapay"
              type="url"
              className="w-full"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              error={urlError}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Payload preview</label>
            <pre className="bg-muted p-4 rounded-md font-mono text-xs overflow-x-auto text-foreground/90 border border-border/50 max-h-48">
              {JSON.stringify(getMockPayload(eventType), null, 2)}
            </pre>
          </div>
        </div>

        {testResult && (
          <div
            className={`p-4 rounded-lg border space-y-3 ${
              testResult.ok
                ? "bg-success/10 text-success border-success/20"
                : "bg-destructive/5 text-destructive border-destructive/20"
            }`}
          >
            {/* Status row */}
            <div className="flex items-start gap-3">
              {testResult.ok ? (
                <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-sm">
                  {testResult.ok ? "Delivery successful" : "Delivery failed"}
                </h4>
                <p className="text-xs mt-1 font-mono break-all">
                  HTTP {testResult.status}{testResult.status > 0 ? "" : " (no response)"} · {testResult.detail}
                  {testResult.latencyMs != null && (
                    <span className="ml-2 text-muted-foreground">· {testResult.latencyMs} ms</span>
                  )}
                </p>

                {/* Error reason when non-2xx */}
                {testResult.errorReason && (
                  <p className="text-xs mt-1.5 rounded bg-destructive/10 px-2 py-1 font-mono border border-destructive/20">
                    Error: {testResult.errorReason}
                  </p>
                )}

                {/* HMAC signature header */}
                {testResult.hmacSignature && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium">X-FluxaPay-Signature sent:</p>
                    <code className="block text-[11px] break-all rounded bg-background/60 border border-border/40 px-2 py-1 font-mono">
                      {testResult.hmacSignature}
                    </code>
                  </div>
                )}

                {/* Response body */}
                {testResult.bodySnippet && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium">Response body:</p>
                    <pre className="text-[11px] p-2 rounded bg-background/50 border border-border/40 overflow-x-auto max-h-28">
                      {testResult.bodySnippet}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Retry button — only shown for failed deliveries that have a log ID */}
            {!testResult.ok && deliveryLogId && (
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handleRetry}
                  disabled={isRetrying}
                >
                  {isRetrying ? (
                    <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Retry delivery
                </Button>
              </div>
            )}
          </div>
        )}

        {/* HMAC verification code snippet */}
        <div className="rounded-lg border bg-muted/30">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg"
            onClick={() => setShowSnippet((v) => !v)}
            aria-expanded={showSnippet}
          >
            <span>Signature verification example (Node.js)</span>
            {showSnippet ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showSnippet && (
            <div className="px-4 pb-4 space-y-2">
              <div className="relative">
                <pre className="bg-background rounded border border-border/60 p-3 font-mono text-[11px] overflow-x-auto max-h-48 text-foreground/90">
                  {HMAC_SNIPPET}
                </pre>
                <button
                  type="button"
                  onClick={copySnippet}
                  className="absolute top-2 right-2 p-1.5 rounded bg-muted hover:bg-muted/80 transition-colors"
                  title="Copy snippet"
                  aria-label="Copy code snippet"
                >
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">timingSafeEqual</code> to prevent timing attacks. See{" "}
                <Link
                  href={DOCS_URLS.WEBHOOK_VERIFICATION}
                  className="text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  full docs
                </Link>{" "}
                for Python and Go examples.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isTesting}>
            Close
          </Button>
          <Button
            variant="default"
            className="gap-2"
            onClick={handleTest}
            disabled={!urlCheck.ok || isTesting}
          >
            {isTesting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Sending…
              </span>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send test webhook
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
