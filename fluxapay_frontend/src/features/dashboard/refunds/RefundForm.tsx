"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Modal } from "@/components/Modal";
import { AlertCircle, Loader2 } from "lucide-react";
import { api, type InitiateRefundRequest, type RefundReason } from "@/lib/api";
import toast from "react-hot-toast";

const REASONS: { label: string; value: RefundReason }[] = [
  { label: "Customer Request", value: "customer_request" },
  { label: "Duplicate Payment", value: "duplicate_payment" },
  { label: "Failed Delivery", value: "failed_delivery" },
  { label: "Merchant Request", value: "merchant_request" },
  { label: "Dispute Resolution", value: "dispute_resolution" },
];

const NETWORK_FEES: Record<string, string> = {
  USDC: "~0.00001 USDC",
  XLM: "~0.00001 XLM",
};

interface RefundFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  paymentId: string;
  merchantId: string;
  currency: "USDC" | "XLM";
  maxAmount: number;
  customerAddress: string;
}

export function RefundForm({
  isOpen,
  onClose,
  onSuccess,
  paymentId,
  merchantId,
  currency,
  maxAmount,
  customerAddress,
}: RefundFormProps) {
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState(maxAmount.toString());
  const [reason, setReason] = useState<RefundReason>("customer_request");
  const [reasonNote, setReasonNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amount =
    refundType === "full" ? maxAmount : Number.parseFloat(partialAmount);

  const isValid =
    Number.isFinite(amount) && amount > 0 && amount <= maxAmount;

  const handleSubmit = async () => {
    setFormError(null);

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Refund amount must be greater than 0.");
      return;
    }

    if (amount > maxAmount) {
      setFormError(
        `Refund amount cannot exceed the remaining refundable amount (${maxAmount} ${currency}).`,
      );
      return;
    }

    const idempotencyKey = `refund_${paymentId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      setIsSubmitting(true);
      const payload: InitiateRefundRequest & { idempotency_key?: string } = {
        paymentId,
        merchantId,
        amount,
        currency,
        customerAddress,
        reason,
        reasonNote: reasonNote.trim() ? reasonNote.trim() : undefined,
        idempotency_key: idempotencyKey,
      };
      await api.refunds.initiate(payload);
      toast.success("Refund initiated successfully.");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to initiate refund.";
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormError(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Initiate Refund">
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="font-medium">Payment {paymentId}</p>
          <p className="text-muted-foreground">
            Max refundable: {maxAmount} {currency}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Refund Type</label>
            <Select
              value={refundType}
              onChange={(e) =>
                setRefundType(e.target.value as "full" | "partial")
              }
            >
              <option value="full">Full Refund ({maxAmount} {currency})</option>
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
              Partial Amount ({currency})
            </label>
            <Input
              type="number"
              min="0.01"
              max={maxAmount}
              step={currency === "XLM" ? "0.0000001" : "0.01"}
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

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Network Fee Estimate</p>
          <p className="text-muted-foreground">
            {NETWORK_FEES[currency] || "Negligible"} — deducted from the refund
            amount on-chain.
          </p>
        </div>

        {formError && (
          <div className="flex items gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={isSubmitting || !isValid}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Initiate Refund"
            )}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
