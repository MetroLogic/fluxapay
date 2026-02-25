import { useMemo, useState } from "react";
import { Payment } from "./payments-mock";
import { Badge } from "@/components/Badge";
import {
  Copy,
  ExternalLink,
  User,
  CreditCard,
  Clock,
  AlertCircle,
  RefreshCcw,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import type { RefundRecord, RefundReason } from "../refunds/refunds-mock";

interface PaymentDetailsProps {
  payment: Payment;
  refunds: RefundRecord[];
  onCreateRefund: (payload: {
    paymentId: string;
    merchantId: string;
    amount: number;
    currency: "USDC" | "XLM";
    customerAddress: string;
    reason: RefundReason;
    reasonNote?: string;
  }) => Promise<void>;
  onOpenRefundsSection: () => void;
}

const REASONS: { label: string; value: RefundReason }[] = [
  { label: "Customer Request", value: "customer_request" },
  { label: "Duplicate Payment", value: "duplicate_payment" },
  { label: "Failed Delivery", value: "failed_delivery" },
  { label: "Merchant Request", value: "merchant_request" },
  { label: "Dispute Resolution", value: "dispute_resolution" },
];

export const PaymentDetails = ({
  payment,
  refunds,
  onCreateRefund,
  onOpenRefundsSection,
}: PaymentDetailsProps) => {
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState(payment.amount.toString());
  const [reason, setReason] = useState<RefundReason>("customer_request");
  const [reasonNote, setReasonNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const paymentRefunds = useMemo(
    () =>
      refunds
        .filter((refund) => refund.paymentId === payment.id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [refunds, payment.id],
  );

  const hasActiveRefund = paymentRefunds.some((refund) =>
    ["initiated", "processing", "completed"].includes(refund.status),
  );
  const canRefundCurrency = payment.currency === "USDC" || payment.currency === "XLM";
  const canInitiateRefund =
    payment.status === "confirmed" && canRefundCurrency && !hasActiveRefund;

  const getRefundStatusBadge = (status: RefundRecord["status"]) => {
    if (status === "completed") return <Badge variant="success">Completed</Badge>;
    if (status === "processing") return <Badge variant="warning">Processing</Badge>;
    if (status === "initiated") return <Badge variant="info">Initiated</Badge>;
    return <Badge variant="error">Failed</Badge>;
  };

  const handleInitiateRefund = async () => {
    setFormError(null);
    const amount =
      refundType === "full" ? payment.amount : Number.parseFloat(partialAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Refund amount must be greater than 0.");
      return;
    }

    if (amount > payment.amount) {
      setFormError("Refund amount cannot exceed the payment amount.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onCreateRefund({
        paymentId: payment.id,
        merchantId: payment.merchantId,
        amount,
        currency: payment.currency as "USDC" | "XLM",
        customerAddress: payment.customerAddress,
        reason,
        reasonNote: reasonNote.trim() ? reasonNote.trim() : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-sm uppercase tracking-wider text-muted-foreground">
            Amount to Pay
          </p>
          <h2 className="text-2xl font-bold uppercase md:text-3xl">
            {payment.amount}{" "}
            <span className="text-lg text-muted-foreground md:text-xl">
              {payment.currency}
            </span>
          </h2>
        </div>
        <div className="text-left sm:text-right">
          <p className="mb-1 text-sm uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <div className="origin-right scale-110">
            {payment.status === "confirmed" && (
              <Badge variant="success">Confirmed</Badge>
            )}
            {payment.status === "pending" && <Badge variant="warning">Pending</Badge>}
            {payment.status === "failed" && <Badge variant="error">Failed</Badge>}
            {payment.status === "expired" && (
              <Badge variant="secondary">Expired</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border bg-muted/20 p-5">
          <div className="flex items-center gap-2 font-semibold text-primary">
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
              <p className="font-medium break-all">{payment.customerEmail}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Order ID</p>
              <code className="rounded bg-muted px-2 py-0.5 text-xs">
                {payment.orderId}
              </code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Refund Address</p>
              <code className="break-all text-xs">{payment.customerAddress}</code>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border bg-muted/20 p-5">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <CreditCard className="h-4 w-4" />
            <h3>Transaction Info</h3>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Payment ID</p>
              <div className="group flex items-center gap-2">
                <code className="text-xs font-mono">{payment.id}</code>
                <button
                  onClick={() => copyToClipboard(payment.id)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Deposit Address</p>
              <div className="group flex items-center gap-2">
                <code className="max-w-[220px] truncate text-xs font-mono">
                  {payment.depositAddress}
                </code>
                <button
                  onClick={() => copyToClipboard(payment.depositAddress)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                  rel="noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                >
                  {payment.txHash.substring(0, 16)}...{" "}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <Clock className="h-4 w-4" />
          <h3>Timeline</h3>
        </div>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="h-3 w-3 rounded-full bg-green-500 ring-4 ring-green-500/20" />
              <div className="h-full w-0.5 bg-border" />
            </div>
            <div className="pb-4">
              <p className="text-sm font-medium">Payment Created</p>
              <p className="text-xs text-muted-foreground">
                {new Date(payment.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          {payment.status === "confirmed" && (
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-3 w-3 rounded-full bg-green-500 ring-4 ring-green-500/20" />
              </div>
              <div>
                <p className="text-sm font-medium">Payment Confirmed</p>
                <p className="text-xs text-muted-foreground">
                  Successfully received on chain
                </p>
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
                <p className="text-xs text-muted-foreground">
                  Transaction was rejected or faulted
                </p>
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
                <p className="text-xs text-muted-foreground">
                  Customer did not pay within time limit
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <RefreshCcw className="h-4 w-4" />
            <h3>Refund Actions</h3>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            onClick={onOpenRefundsSection}
          >
            View All Refunds
          </Button>
        </div>

        {!canRefundCurrency && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Refunds currently support only USDC and XLM payments.
          </p>
        )}
        {!canInitiateRefund && canRefundCurrency && (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Refund not available for this payment due to status or an existing refund.
          </p>
        )}

        {canInitiateRefund && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Refund Type</label>
                <Select
                  value={refundType}
                  onChange={(e) =>
                    setRefundType(e.target.value as "full" | "partial")
                  }
                >
                  <option value="full">Full Refund ({payment.amount})</option>
                  <option value="partial">Partial Refund</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Reason</label>
                <Select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as RefundReason)}
                >
                  {REASONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {refundType === "partial" && (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Partial Amount
                </label>
                <Input
                  type="number"
                  min="0.01"
                  max={payment.amount}
                  step="0.01"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">
                Note (optional)
              </label>
              <Input
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder="Add context for audit trail"
              />
            </div>

            {formError && (
              <p className="text-sm text-red-500">{formError}</p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="w-full sm:w-auto"
                onClick={handleInitiateRefund}
                disabled={isSubmitting}
              >
                <AlertCircle className="h-4 w-4" />
                {isSubmitting ? "Submitting..." : "Initiate Refund"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-primary">Refund History (This Payment)</h3>
          <span className="text-xs text-muted-foreground">
            {paymentRefunds.length} record(s)
          </span>
        </div>
        {paymentRefunds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No refunds created yet.</p>
        ) : (
          <div className="space-y-2">
            {paymentRefunds.map((refund) => (
              <div
                key={refund.id}
                className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">{refund.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {refund.amount} {refund.currency} •{" "}
                    {new Date(refund.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getRefundStatusBadge(refund.status)}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-2"
                    onClick={onOpenRefundsSection}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <Button className="flex-1 gap-2">
          <ExternalLink className="h-4 w-4" />
          Open in Explorer
        </Button>
      </div>
    </div>
  );
};
