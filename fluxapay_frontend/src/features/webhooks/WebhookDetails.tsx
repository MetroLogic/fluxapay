import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { WebhookEvent, WebhookStatus } from "./webhooks-mock";
import { Copy, RefreshCw } from "lucide-react";

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
    if (!webhook) return null;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
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
                                {webhook.eventType}
                            </span>
                            {getStatusBadge(webhook.status)}
                        </div>
                    </div>
                    <div className="text-right">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-1">
                            Created At
                        </h4>
                        <span className="text-sm">
                            {new Date(webhook.createdAt).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Endpoint */}
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex justify-between items-center mb-2">
                        Endpoint
                        <button
                            onClick={() => handleCopy(webhook.endpoint)}
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <Copy className="h-3 w-3" /> Copy
                        </button>
                    </h4>
                    <div className="bg-muted p-3 rounded-md font-mono text-sm break-all">
                        {webhook.endpoint}
                    </div>
                </div>

                {/* Payload */}
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex justify-between items-center mb-2">
                        Request Payload
                        <button
                            onClick={() =>
                                handleCopy(JSON.stringify(webhook.payload, null, 2))
                            }
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <Copy className="h-3 w-3" /> Copy
                        </button>
                    </h4>
                    <pre className="bg-muted p-4 rounded-md font-mono text-xs overflow-x-auto text-foreground/90 border border-border/50">
                        {JSON.stringify(webhook.payload, null, 2)}
                    </pre>
                </div>

                {/* Response */}
                <div>
                    <h4 className="text-sm font-semibold text-muted-foreground flex justify-between items-center mb-2">
                        Response ({webhook.response.status})
                        <button
                            onClick={() =>
                                handleCopy(JSON.stringify(webhook.response, null, 2))
                            }
                            className="text-xs flex items-center gap-1 hover:text-primary transition-colors"
                        >
                            <Copy className="h-3 w-3" /> Copy
                        </button>
                    </h4>
                    <pre className="bg-muted p-4 rounded-md font-mono text-xs overflow-x-auto text-foreground/90 border border-border/50">
                        {JSON.stringify(webhook.response, null, 2)}
                    </pre>
                </div>

                {/* Retry History */}
                {webhook.retryHistory && webhook.retryHistory.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 border-b pb-2">
                            Retry History
                        </h4>
                        <div className="space-y-3">
                            {webhook.retryHistory.map((retry, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded-md"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-muted-foreground">
                                            Attempt {webhook.retryHistory.length - index}
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
                    <Button variant="default" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Manual Retry
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
