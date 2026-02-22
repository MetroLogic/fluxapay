import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { Input } from "@/components/Input";
import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";

interface WebhookTestProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WebhookTest = ({ isOpen, onClose }: WebhookTestProps) => {
    const [eventType, setEventType] = useState("payment.success");
    const [endpoint, setEndpoint] = useState("");
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        status: number;
        message: string;
    } | null>(null);

    const getMockPayload = (type: string) => {
        switch (type) {
            case "payment.success":
                return {
                    event: "payment.success",
                    data: {
                        paymentId: "pay_test_123",
                        amount: 500,
                        currency: "USDC",
                        status: "confirmed",
                    },
                };
            case "payment.failed":
                return {
                    event: "payment.failed",
                    data: {
                        paymentId: "pay_test_456",
                        amount: 100,
                        currency: "XLM",
                        status: "failed",
                        reason: "insufficient_funds",
                    },
                };
            case "payout.completed":
                return {
                    event: "payout.completed",
                    data: {
                        payoutId: "po_test_789",
                        amount: 10000,
                        currency: "USDC",
                        status: "completed",
                    },
                };
            default:
                return { event: type, data: {} };
        }
    };

    const handleTest = async () => {
        if (!endpoint) return;
        setIsTesting(true);
        setTestResult(null);

        // Simulate API call for testing the webhook
        setTimeout(() => {
            setIsTesting(false);
            // Simulate success
            setTestResult({ status: 200, message: "OK" });
        }, 1500);
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
                            <option value="payment.success">payment.success</option>
                            <option value="payment.failed">payment.failed</option>
                            <option value="payout.completed">payout.completed</option>
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
