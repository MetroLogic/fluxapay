import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { WebhookEvent, WebhookStatus } from "./webhooks-mock";
import { Copy, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

interface WebhookDetailsProps {
    webhook: WebhookEvent | null;
    isOpen: boolean;
    onClose: () => void;
}

export const WebhookDetails = ({
    webhook,
    isOpen,
    onClose,
}: WebhookDetailsProps) => {
    const [loading, setLoading] = useState(false);
    const [details, setDetails] = useState<WebhookEvent | null>(null);

    const merged = useMemo(() => {
        if (!webhook) return null;
        return details ?? webhook;
    }, [details, webhook]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!isOpen || !webhook) return;
            setLoading(true);
            try {
                const res = await api.webhooks.logDetails(webhook.id);
                const d = res?.data;
                if (!d || cancelled) return;

                const retryAttempts = Array.isArray(d.retry_attempts) ? d.retry_attempts : [];

                setDetails({
                    id: String(d.id),
                    paymentId: String(d.payment_id ?? ""),
                    eventType: String(d.event_type),
                    status: d.status,
                    endpoint: String(d.endpoint_url),
                    attempts: Number(d.retry_count ?? 0) + 1,
                    lastAttempt: String(d.updated_at ?? d.created_at),
                    createdAt: String(d.created_at),
                    payload: (d.request_payload ?? {}) as Record<string, unknown>,
                    response: {
                        status: Number(d.http_status ?? 0),
                        body: d.response_body,
                    },
                    retryHistory: retryAttempts.map((a: any) => ({
                        timestamp: String(a.timestamp),
                        status: d.status,
                        responseCode: Number(a.http_status ?? 0),
                    })),
                });
            } catch (e) {
                if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load webhook details");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [webhook?.id, isOpen]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard.");
    };

    const getStatusBadge = (status: WebhookStatus) => {
        switch (status) {
            case "delivered":
                return <Badge variant="success">Delivered</Badge>;
            case "pending":
                return <Badge variant="warning">Pending</Badge>;
            case "failed":
                return <Badge variant="error">Failed</Badge>;
            default:
                return <Badge>{status}</Badge>;
        }
    };

    if (!webhook || !merged) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Webhook Details">
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                {/* Header Info */}
                <div className="flex items-center justify-between border-b pb-4">
                    <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-1">
                            Event
                        </h4>
                        <div className="flex items-center gap-3">
                            <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                                {merged.eventType}
                            </span>
                            {getStatusBadge(merged.status)}
                        </div>
                    </div>
                    <div className="text-right">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-1">
                            Created At
                        </h4>
                        <span className="text-sm">
                            {new Date(merged.createdAt).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Endpoint */}
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex justify-between items-center mb-2">
                        Endpoint
                        <button
                            onClick={() => handleCopy(merged.endpoint)}
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <Copy className="h-3 w-3" /> Copy
                        </button>
                    </h4>
                    <div className="bg-muted p-3 rounded-md font-mono text-sm break-all">
                        {merged.endpoint}
                    </div>
                </div>

                {/* Payload */}
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex justify-between items-center mb-2">
                        Request Payload
                        <button
                            onClick={() =>
                                handleCopy(JSON.stringify(merged.payload, null, 2))
                            }
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <Copy className="h-3 w-3" /> Copy
                        </button>
                    </h4>
                    <pre className="bg-muted p-4 rounded-md font-mono text-xs overflow-x-auto text-foreground/90 border border-border/50">
                        {JSON.stringify(merged.payload, null, 2)}
                    </pre>
                </div>

                {/* Response */}
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex justify-between items-center mb-2">
                        Response ({merged.response.status})
                        <button
                            onClick={() =>
                                handleCopy(JSON.stringify(merged.response, null, 2))
                            }
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <Copy className="h-3 w-3" /> Copy
                        </button>
                    </h4>
                    <pre className="bg-muted p-4 rounded-md font-mono text-xs overflow-x-auto text-foreground/90 border border-border/50">
                        {JSON.stringify(merged.response, null, 2)}
                    </pre>
                </div>

                {/* Retry History */}
                {merged.retryHistory && merged.retryHistory.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 border-b pb-2">
                            Retry History
                        </h4>
                        <div className="space-y-3">
                            {merged.retryHistory.map((retry, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded-md"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-muted-foreground">
                                            Attempt {merged.retryHistory.length - index}
                                        </span>
                                        {getStatusBadge(retry.status)}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono text-xs">
                                            HTTP {retry.responseCode}
                                        </span>
                                        <span className="text-muted-foreground text-xs">
                                            {new Date(retry.timestamp).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-background pb-2">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        variant="default"
                        className="gap-2"
                        disabled={loading}
                        onClick={async () => {
                            try {
                                setLoading(true);
                                await api.webhooks.retry(webhook.id);
                                toast.success("Retry initiated.");
                                const res = await api.webhooks.logDetails(webhook.id);
                                const d = res?.data;
                                if (d) {
                                    setDetails((prev) => prev ? { ...prev, status: d.status } : prev);
                                }
                            } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Retry failed");
                            } finally {
                                setLoading(false);
                            }
                        }}
                    >
                        <RefreshCw className="h-4 w-4" />
                        Manual Retry
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
