import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { Input } from "@/components/Input";
import { useState } from "react";
import { Send, CheckCircle2, XCircle } from "lucide-react";
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

export const WebhookTest = ({ isOpen, onClose }: WebhookTestProps) => {
  const [eventType, setEventType] = useState("payment_completed");
  const [endpoint, setEndpoint] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status: number;
    detail: string;
    bodySnippet?: string;
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

  const handleTest = async () => {
    if (!urlCheck.ok) {
      toast.error(urlCheck.message);
      return;
    }
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = (await api.webhooks.sendTest({
        event_type: eventType,
        endpoint_url: endpoint.trim(),
      })) as {
        data?: { http_status?: number; response_body?: string; status?: string };
      };
      const httpStatus = Number(res?.data?.http_status ?? 0);
      const ok = httpStatus >= 200 && httpStatus < 300;
      const bodyRaw =
        typeof res?.data?.response_body === "string" ? res.data.response_body : "";
      setTestResult({
        ok,
        status: httpStatus,
        detail: res?.data?.status ? String(res.data.status) : (ok ? "delivered" : "failed"),
        bodySnippet: bodyRaw ? snippet(bodyRaw) : undefined,
      });
      if (ok) {
        toast.success("Test webhook delivered. Verify the signature on your server.");
      } else {
        toast.error(`Test webhook returned HTTP ${httpStatus || "error"}.`);
      }
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
            className={`p-4 rounded-lg border flex items-start gap-3 ${
              testResult.ok
                ? "bg-success/10 text-success border-success/20"
                : "bg-destructive/5 text-destructive border-destructive/20"
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <h4 className="font-semibold text-sm">
                {testResult.ok ? "Delivery response" : "Test did not succeed"}
              </h4>
              <p className="text-xs mt-1 font-mono break-all">
                HTTP {testResult.status} · {testResult.detail}
              </p>
              {testResult.bodySnippet && (
                <pre className="text-[11px] mt-2 p-2 rounded bg-background/50 border border-border/40 overflow-x-auto max-h-28">
                  {testResult.bodySnippet}
                </pre>
              )}
            </div>
          </div>
        )}

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
