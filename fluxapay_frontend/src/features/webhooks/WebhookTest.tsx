import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { Input } from "@/components/Input";
import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";
import { api } from "@/lib/api";

interface WebhookTestProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WebhookTest = ({ isOpen, onClose }: WebhookTestProps) => {
    const [eventType, setEventType] = useState("payment_completed");
    const [endpoint, setEndpoint] = useState("");
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        status: number;
        message: string;
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

    const handleTest = async () => {
        if (!endpoint) return;
        setIsTesting(true);
        setTestResult(null);

        try {
            const res = await api.webhooks.sendTest({
                event_type: eventType,
                endpoint_url: endpoint,
            });
            // Backend returns { message, data: { http_status, response_body, ... } }
            const httpStatus = Number(res?.data?.http_status ?? 200);
            setTestResult({ status: httpStatus, message: "OK" });
            toast.success("Test webhook sent.");
        } catch (e) {
            toastApiError(e);
            setTestResult({ status: 0, message: "Failed" });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Test Webhook Configuration">
            <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                    Send a mock webhook event to your configured endpoint to ensure your
                    integration is handling events correctly.
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Event Type
                        </label>
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
                        <label className="block text-sm font-medium mb-1">
                            Test Endpoint URL
                        </label>
                        <Input
                            placeholder="https://your-domain.com/webhooks/fluxapay"
                            type="url"
                            className="w-full"
                            value={endpoint}
                            onChange={(e) => setEndpoint(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Payload Preview
                        </label>
                        <pre className="bg-muted p-4 rounded-md font-mono text-xs overflow-x-auto text-foreground/90 border border-border/50 max-h-48">
                            {JSON.stringify(getMockPayload(eventType), null, 2)}
                        </pre>
                    </div>
                </div>

                {testResult && (
                    <div className="p-4 bg-success/10 text-success border border-success/20 rounded-lg flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-sm">
                                Test Request Successful
                            </h4>
                            <p className="text-xs opacity-90 mt-1 pb-1 font-mono">
                                HTTP {testResult.status} {testResult.message}
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={onClose} disabled={isTesting}>
                        Cancel
                    </Button>
                    <Button
                        variant="default"
                        className="gap-2"
                        onClick={handleTest}
                        disabled={!endpoint || isTesting}
                    >
                        {isTesting ? (
                            <span className="flex items-center gap-2">
                                <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                Sending...
                            </span>
                        ) : (
                            <>
                                <Send className="h-4 w-4" />
                                Send Test
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
