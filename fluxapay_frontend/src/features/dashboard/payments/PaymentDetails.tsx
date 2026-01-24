import { Payment } from "./payments-mock";
import { Badge } from "@/components/Badge";
import {
    Copy,
    ExternalLink,
    User,
    CreditCard,
    Clock,
    ArrowRight,
    ShieldCheck,
    AlertCircle
} from "lucide-react";
import { Button } from "@/components/Button";

interface PaymentDetailsProps {
    payment: Payment;
}

export const PaymentDetails = ({ payment }: PaymentDetailsProps) => {
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header Info */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider">Amount to Pay</p>
                    <h2 className="text-3xl font-bold uppercase">
                        {payment.amount} <span className="text-xl text-muted-foreground">{payment.currency}</span>
                    </h2>
                </div>
                <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider">Status</p>
                    <div className="scale-110 origin-right">
                        {payment.status === "confirmed" && <Badge variant="success">Confirmed</Badge>}
                        {payment.status === "pending" && <Badge variant="warning">Pending</Badge>}
                        {payment.status === "failed" && <Badge variant="error">Failed</Badge>}
                        {payment.status === "expired" && <Badge variant="secondary">Expired</Badge>}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Details */}
                <div className="space-y-4 p-5 rounded-2xl border bg-muted/20">
                    <div className="flex items-center gap-2 text-primary font-semibold">
                        <User className="h-4 w-4" />
                        <h3>Customer Details</h3>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-muted-foreground">Name</p>
                            <p className="font-medium">{payment.customerName}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Email</p>
                            <p className="font-medium">{payment.customerEmail}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Order ID</p>
                            <code className="text-xs bg-muted px-2 py-0.5 rounded">{payment.orderId}</code>
                        </div>
                    </div>
                </div>

                {/* Payment IDs */}
                <div className="space-y-4 p-5 rounded-2xl border bg-muted/20">
                    <div className="flex items-center gap-2 text-primary font-semibold">
                        <CreditCard className="h-4 w-4" />
                        <h3>Transaction Info</h3>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-muted-foreground">Payment ID</p>
                            <div className="flex items-center gap-2 group">
                                <code className="text-xs font-mono">{payment.id}</code>
                                <button
                                    onClick={() => copyToClipboard(payment.id)}
                                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <Copy className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Deposit Address</p>
                            <div className="flex items-center gap-2 group">
                                <code className="text-xs font-mono truncate max-w-[150px]">{payment.depositAddress}</code>
                                <button
                                    onClick={() => copyToClipboard(payment.depositAddress)}
                                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <Copy className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                        {payment.txHash && (
                            <div>
                                <p className="text-xs text-muted-foreground">Transaction Hash</p>
                                <a
                                    href={`https://stellar.expert/explorer/public/tx/${payment.txHash}`}
                                    target="_blank"
                                    className="text-xs font-mono text-primary flex items-center gap-1 hover:underline mt-1"
                                >
                                    {payment.txHash.substring(0, 16)}... <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Timeline / Events */}
            <div className="space-y-4 border-t pt-6">
                <div className="flex items-center gap-2 text-primary font-semibold">
                    <Clock className="h-4 w-4" />
                    <h3>Timeline</h3>
                </div>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex flex-col items-center">
                            <div className="h-3 w-3 rounded-full bg-green-500 ring-4 ring-green-500/20" />
                            <div className="w-0.5 h-full bg-border" />
                        </div>
                        <div className="pb-4">
                            <p className="text-sm font-medium">Payment Created</p>
                            <p className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleString()}</p>
                        </div>
                    </div>
                    {payment.status === "confirmed" && (
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <div className="h-3 w-3 rounded-full bg-green-500 ring-4 ring-green-500/20" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Payment Confirmed</p>
                                <p className="text-xs text-muted-foreground">Successfully received on chain</p>
                            </div>
                        </div>
                    )}
                    {payment.status === "failed" && (
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <div className="h-3 w-3 rounded-full bg-red-500 ring-4 ring-red-500/20" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Payment Failed</p>
                                <p className="text-xs text-muted-foreground">Transaction was rejected or faulted</p>
                            </div>
                        </div>
                    )}
                    {payment.status === "expired" && (
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <div className="h-3 w-3 rounded-full bg-muted-foreground/50 ring-4 ring-muted-foreground/10" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Payment Expired</p>
                                <p className="text-xs text-muted-foreground">Customer did not pay within time limit</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex gap-3 pt-4">
                {payment.status === "confirmed" && (
                    <Button variant="secondary" className="flex-1 gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Initiate Refund
                    </Button>
                )}
                <Button className="flex-1 gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Open in Explorer
                </Button>
            </div>
        </div>
    );
};
