"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { api, type RefundReason } from "@/lib/api";
import type { Payment } from "./types";

const REASONS: { label: string; value: RefundReason }[] = [
  { label: "Customer Request", value: "customer_request" },
  { label: "Duplicate Payment", value: "duplicate_payment" },
  { label: "Failed Delivery", value: "failed_delivery" },
  { label: "Merchant Request", value: "merchant_request" },
  { label: "Dispute Resolution", value: "dispute_resolution" },
];

interface RefundRecord {
  paymentId: string;
  amount: number | string;
  status: "pending" | "processing" | "completed" | "failed";
}

interface RefundListResponse {
  data?: {
    refunds?: RefundRecord[];
    pagination?: { total_pages?: number };
  };
}

interface RefundPage {
  refunds: RefundRecord[];
  pagination: { total_pages: number };
}

interface RefundModalProps {
  isOpen: boolean;
  payment: Payment;
  onClose: () => void;
  onSuccess: (status: "partially_refunded" | "refunded") => void;
}

function getRefunds(response: unknown): RefundPage {
  if (!response || typeof response !== "object") {
    throw new Error("Unable to load refund history.");
  }
  const data = (response as RefundListResponse).data;
  const totalPages = data?.pagination?.total_pages;
  if (
    !data ||
    !Array.isArray(data.refunds) ||
    typeof totalPages !== "number" ||
    !Number.isInteger(totalPages) ||
    totalPages < 0
  ) {
    throw new Error("Unable to load refund history.");
  }
  return { refunds: data.refunds, pagination: { total_pages: totalPages } };
}

export function RefundModal({
  isOpen,
  payment,
  onClose,
  onSuccess,
}: RefundModalProps) {
  const [refundedAmount, setRefundedAmount] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [reason, setReason] = useState<RefundReason | "">("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currencySupported = payment.currency === "USDC" || payment.currency === "XLM";

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setRefundedAmount(null);
    setHistoryError(null);
    setHistoryLoading(true);

    const fetchRefundHistory = async () => {
      try {
        let page = 1;
        let totalPages = 1;
        let total = 0;

        do {
          const response = await api.refunds.list({
            paymentId: payment.id,
            page,
            limit: 100,
            signal: controller.signal,
          });
          if ("error" in response) throw response.error;
          const data = getRefunds(response.data);
          totalPages = data.pagination.total_pages;
          for (const refund of data.refunds) {
            if (
              refund.paymentId === payment.id &&
              ["pending", "processing", "completed"].includes(refund.status)
            ) {
              const refundAmount = Number(refund.amount);
              if (!Number.isFinite(refundAmount) || refundAmount < 0) {
                throw new Error("Refund history contains an invalid amount.");
              }
              total += refundAmount;
            }
          }
          page += 1;
        } while (page <= totalPages && !controller.signal.aborted);

        if (!controller.signal.aborted) {
          setRefundedAmount(total);
          setAmountInput(String(Math.max(0, payment.amount - total)));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Unable to load refund history.";
        setHistoryError(message);
        toast.error(message);
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    };

    void fetchRefundHistory();
    return () => controller.abort();
  }, [isOpen, payment.amount, payment.id]);

  const remainingAmount =
    refundedAmount === null ? 0 : Math.max(0, payment.amount - refundedAmount);
  const amount = Number(amountInput);
  const isAmountValid =
    Number.isFinite(amount) && amount > 0 && amount <= remainingAmount;
  const amountStep = payment.currency === "XLM" ? "0.0000001" : "0.01";
  const canRefundStatus = [
    "confirmed",
    "overpaid",
    "paid",
    "completed",
    "partially_refunded",
  ].includes(payment.status);

  const displayedValues = useMemo(
    () => ({
      original: `${payment.amount.toLocaleString()} ${payment.currency}`,
      refunded: `${(refundedAmount ?? 0).toLocaleString()} ${payment.currency}`,
      remaining: `${remainingAmount.toLocaleString()} ${payment.currency}`,
    }),
    [payment.amount, payment.currency, refundedAmount, remainingAmount],
  );

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Refund amount must be greater than 0.");
      return;
    }
    if (amount > remainingAmount) {
      setFormError(
        `Refund amount cannot exceed the remaining refundable balance (${remainingAmount} ${payment.currency}).`,
      );
      return;
    }
    if (!reason) {
      setFormError("Select a reason for the refund.");
      return;
    }
    if (payment.currency !== "USDC" && payment.currency !== "XLM") {
      setFormError("Refunds are only supported for USDC and XLM payments.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.refunds.initiate({
        paymentId: payment.id,
        merchantId: payment.merchantId,
        amount,
        currency: payment.currency,
        customerAddress: payment.customerAddress,
        reason,
      });
      if ("error" in response) throw response.error;
      const status = amount >= remainingAmount ? "refunded" : "partially_refunded";
      toast.success("Refund initiated successfully.");
      onSuccess(status);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to initiate refund.";
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    !historyLoading &&
    refundedAmount !== null &&
    !historyError &&
    currencySupported &&
    canRefundStatus &&
    isAmountValid &&
    reason !== "" &&
    !isSubmitting;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Issue Refund">
      <div className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Original payment</dt>
            <dd className="font-medium">{displayedValues.original}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Already refunded</dt>
            <dd className="font-medium">{displayedValues.refunded}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Remaining refundable</dt>
            <dd className="font-medium">{displayedValues.remaining}</dd>
          </div>
        </dl>

        {historyLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading refund history...
          </div>
        ) : historyError ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {historyError}
          </div>
        ) : !currencySupported ? (
          <p className="text-sm text-destructive">
            Refunds are only supported for USDC and XLM payments.
          </p>
        ) : !canRefundStatus ? (
          <p className="text-sm text-destructive">
            This payment is not in a refundable status.
          </p>
        ) : remainingAmount <= 0 ? (
          <p className="text-sm text-muted-foreground">
            This payment has no remaining refundable balance.
          </p>
        ) : (
          <>
            <div>
              <label htmlFor="refund-amount" className="mb-1 block text-sm font-medium">
                Refund amount ({payment.currency})
              </label>
              <Input
                id="refund-amount"
                type="number"
                min={amountStep}
                max={remainingAmount}
                step={amountStep}
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                aria-invalid={amountInput !== "" && !isAmountValid}
              />
              {amountInput !== "" && !isAmountValid && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  Enter an amount greater than 0 and no more than {remainingAmount} {payment.currency}.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="refund-reason" className="mb-1 block text-sm font-medium">
                Reason <span aria-hidden="true">*</span>
              </label>
              <Select
                id="refund-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value as RefundReason | "")}
              >
                <option value="">Select a reason</option>
                {REASONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        {formError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Button className="flex-1" onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Confirm Refund"
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
