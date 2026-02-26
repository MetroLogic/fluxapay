"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MOCK_PAYMENTS,
} from "@/features/dashboard/payments/payments-mock";
import { PaymentsTable } from "@/features/dashboard/payments/PaymentsTable";
import { PaymentsFilters } from "@/features/dashboard/payments/PaymentsFilters";
import { PaymentDetails } from "@/features/dashboard/payments/PaymentDetails";
import {
  MOCK_REFUNDS,
  type RefundRecord,
  type RefundReason,
} from "@/features/dashboard/refunds/refunds-mock";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Download, Plus } from "lucide-react";
import { Suspense } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { QRCodeCanvas } from "qrcode.react";

interface BackendRefund {
  id: string;
  payment_id: string;
  merchant_id: string;
  amount: number;
  currency: "USDC" | "XLM";
  customer_address: string;
  reason: RefundReason;
  reason_note?: string;
  status: RefundRecord["status"];
  stellar_tx_hash?: string;
  created_at: string;
}

function PaymentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenCreateLink =
    searchParams.get("action") === "create-payment-link";
  const paymentIdFromQuery = searchParams.get("paymentId");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    paymentIdFromQuery || null,
  );
  const [refunds, setRefunds] = useState<RefundRecord[]>(MOCK_REFUNDS);
  const [showCreateLinkModal, setShowCreateLinkModal] =
    useState(shouldOpenCreateLink);
  const [linkAmount, setLinkAmount] = useState("100");
  const [linkCurrency, setLinkCurrency] = useState("USD");
  const [linkDescription, setLinkDescription] = useState("Invoice payment");
  const [linkSuccessUrl, setLinkSuccessUrl] = useState("");
  const [linkCancelUrl, setLinkCancelUrl] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [recentLinks, setRecentLinks] = useState<
    {
      id: string;
      url: string;
      amount: number;
      currency: string;
      description?: string;
      createdAt: string;
    }[]
  >([]);

  const filteredPayments = useMemo(() => {
    return MOCK_PAYMENTS.filter((payment) => {
      const matchesSearch =
        payment.id.toLowerCase().includes(search.toLowerCase()) ||
        payment.orderId.toLowerCase().includes(search.toLowerCase()) ||
        payment.customerEmail.toLowerCase().includes(search.toLowerCase()) ||
        payment.customerName.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || payment.status === statusFilter;
      const matchesCurrency =
        currencyFilter === "all" || payment.currency === currencyFilter;

      return matchesSearch && matchesStatus && matchesCurrency;
    });
  }, [search, statusFilter, currencyFilter]);

  const selectedPayment = useMemo(() => {
    const id = selectedPaymentId ?? paymentIdFromQuery;
    if (!id) return null;
    return MOCK_PAYMENTS.find((item) => item.id === id) ?? null;
  }, [selectedPaymentId, paymentIdFromQuery]);

  const mapBackendRefund = (refund: BackendRefund): RefundRecord => ({
    id: refund.id,
    paymentId: refund.payment_id,
    merchantId: refund.merchant_id,
    amount: refund.amount,
    currency: refund.currency,
    customerAddress: refund.customer_address,
    reason: refund.reason,
    reasonNote: refund.reason_note,
    status: refund.status,
    stellarTxHash: refund.stellar_tx_hash,
    createdAt: refund.created_at,
  });

  const handleExportCSV = () => {
    const headers = [
      "ID",
      "Amount",
      "Currency",
      "Status",
      "Customer",
      "Email",
      "OrderID",
      "Date",
    ];
    const rows = filteredPayments.map((p) => [
      p.id,
      p.amount,
      p.currency,
      p.status,
      p.customerName,
      p.customerEmail,
      p.orderId,
      p.createdAt,
    ]);

    const csvContent = [headers, ...rows].map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `payments_export_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenCreateLink = () => {
    setShowCreateLinkModal(true);
    if (searchParams.get("action")) {
      router.replace("/dashboard/payments");
    }
  };

  const handleGenerateLink = async () => {
    const amountNumber = Number(linkAmount);
    if (!amountNumber || amountNumber <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    setIsGeneratingLink(true);
    try {
      const payload = {
        amount: amountNumber,
        currency: linkCurrency,
        description: linkDescription || undefined,
        success_url: linkSuccessUrl || undefined,
        cancel_url: linkCancelUrl || undefined,
      };

      const response = (await api.payments.create(payload)) as {
        payment?: {
          id: string;
          checkoutUrl?: string;
          checkout_url?: string;
          status?: string;
        };
      };

      const payment = response?.payment;
      if (!payment?.id) {
        throw new Error("Payment link could not be created.");
      }

      const url =
        payment.checkoutUrl ??
        payment.checkout_url ??
        `${window.location.origin}/pay/${payment.id}`;

      setGeneratedLink(url);
      setRecentLinks((prev) => [
        {
          id: payment.id,
          url,
          amount: amountNumber,
          currency: linkCurrency,
          description: linkDescription || undefined,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 5));

      toast.success("Payment link created successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to create payment link. Please try again.";
      toast.error(message);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    toast.success("Payment link copied to clipboard.");
  };

  const handleInitiateRefund = async (payload: {
    paymentId: string;
    merchantId: string;
    amount: number;
    currency: "USDC" | "XLM";
    customerAddress: string;
    reason: RefundReason;
    reasonNote?: string;
  }) => {
    try {
      const response = (await api.refunds.initiate(payload)) as {
        refund?: BackendRefund;
      };

      const createdRefund: RefundRecord = response.refund
        ? mapBackendRefund(response.refund)
        : {
          id: `ref_${Date.now()}`,
          paymentId: payload.paymentId,
          merchantId: payload.merchantId,
          amount: payload.amount,
          currency: payload.currency,
          customerAddress: payload.customerAddress,
          reason: payload.reason,
          reasonNote: payload.reasonNote,
          status: "initiated",
          createdAt: new Date().toISOString(),
        };

      setRefunds((prev) => [createdRefund, ...prev]);
      toast.success("Refund submitted successfully.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to submit refund at this time.";
      toast.error(message);
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Payments History
          </h2>
          <p className="text-muted-foreground">
            View and manage all transactions processed through Fluxapay.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => router.push("/dashboard/refunds")}
          >
            Refunds
          </Button>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button className="gap-2" onClick={handleOpenCreateLink}>
            <Plus className="h-4 w-4" />
            New Payment
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border p-6 shadow-sm">
        {recentLinks.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Recent payment links</h3>
                <p className="text-xs text-muted-foreground">
                  Links you&apos;ve generated in this session.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {recentLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium break-all">
                      {link.url}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {link.amount} {link.currency}
                      {link.description ? ` • ${link.description}` : ""} •{" "}
                      {new Date(link.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 mt-1 sm:mt-0"
                    onClick={async () => {
                      await navigator.clipboard.writeText(link.url);
                      toast.success("Payment link copied to clipboard.");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <PaymentsFilters
          onSearchChange={setSearch}
          onStatusChange={setStatusFilter}
          onCurrencyChange={setCurrencyFilter}
        />

        <PaymentsTable
          payments={filteredPayments}
          onRowClick={(payment) => setSelectedPaymentId(payment.id)}
        />

        <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {filteredPayments.length} of {MOCK_PAYMENTS.length} payments
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!selectedPayment}
        onClose={() => {
          setSelectedPaymentId(null);
          if (paymentIdFromQuery) router.replace("/dashboard/payments");
        }}
        title="Payment Details"
      >
        {selectedPayment && (
          <PaymentDetails
            payment={selectedPayment}
            refunds={refunds}
            onCreateRefund={handleInitiateRefund}
            onOpenRefundsSection={() =>
              router.push(`/dashboard/refunds?paymentId=${selectedPayment.id}`)
            }
          />
        )}
      </Modal>

      <Modal
        isOpen={showCreateLinkModal}
        onClose={() => setShowCreateLinkModal(false)}
        title="Create Payment Link"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Amount</label>
            <input
              type="number"
              value={linkAmount}
              onChange={(e) => setLinkAmount(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Currency</label>
            <select
              value={linkCurrency}
              onChange={(e) => setLinkCurrency(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Description
            </label>
            <input
              type="text"
              value={linkDescription}
              onChange={(e) => setLinkDescription(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Success URL (optional)
            </label>
            <input
              type="url"
              value={linkSuccessUrl}
              onChange={(e) => setLinkSuccessUrl(e.target.value)}
              placeholder="https://your-site.com/checkout/success"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Cancel URL (optional)
            </label>
            <input
              type="url"
              value={linkCancelUrl}
              onChange={(e) => setLinkCancelUrl(e.target.value)}
              placeholder="https://your-site.com/checkout/cancel"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleGenerateLink}
              disabled={isGeneratingLink}
            >
              {isGeneratingLink ? "Generating..." : "Generate Link"}
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              onClick={handleCopyLink}
              disabled={!generatedLink}
            >
              Copy Link
            </Button>
          </div>

          {generatedLink ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted p-3 text-xs break-all">
                {generatedLink}
              </div>
              <div className="flex justify-center">
                <div className="bg-background rounded-lg p-3 border">
                  <QRCodeCanvas
                    value={generatedLink}
                    size={160}
                    level="M"
                    includeMargin
                  />
                </div>
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Draft link for {linkAmount || "0"} {linkCurrency}
            {linkDescription ? ` - ${linkDescription}` : ""}.
          </p>
        </div>
      </Modal>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }
    >
      <PaymentsContent />
    </Suspense>
  );
}
