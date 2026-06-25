"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PaymentsTable } from "@/features/dashboard/payments/PaymentsTable";
import { PaymentsFilters } from "@/features/dashboard/payments/PaymentsFilters";
import { type Payment } from "@/features/dashboard/payments/types";
import { PaymentDrawer } from "@/features/dashboard/payments/PaymentDrawer";
import { usePaymentUpdates } from "@/hooks/usePaymentUpdates";
import {
  type RefundRecord,
  type RefundReason,
} from "@/features/dashboard/refunds/refunds-mock";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Download, Plus, Wifi, WifiOff } from "lucide-react";
import { Suspense } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { QRCodeCanvas } from "qrcode.react";
import { DataTableCard, TablePaginationBar } from "@/components/data-table";

const PAGE_SIZE = 20;

interface BackendPayment {
  id: string;
  amount: number;
  currency: string;
  status: Payment["status"];
  checkoutUrl?: string;
  checkout_url?: string;
  merchantId: string;
  customer_email: string;
  order_id?: string;
  createdAt: string;
  depositAddress?: string;
  transaction_hash?: string;
  sweep_status?: string;
  settlement_linkage?: unknown;
  stellar_expert_url?: string;
  fiat_equivalent?: number;
  fiat_currency?: string;
}

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

function mapBackendPayment(p: BackendPayment): Payment {
  return {
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    checkoutUrl: p.checkoutUrl ?? p.checkout_url,
    merchantId: p.merchantId,
    customerName: "",
    customerEmail: p.customer_email ?? "",
    customerAddress: "",
    orderId: p.order_id ?? "",
    createdAt: p.createdAt,
    depositAddress: p.depositAddress ?? "",
    txHash: p.transaction_hash,
    sweepStatus: p.sweep_status,
    settlementLinkage: p.settlement_linkage,
    stellarExpertUrl: p.stellar_expert_url,
    fiatEquivalent: p.fiat_equivalent,
    fiatCurrency: p.fiat_currency,
  };
}

function mapBackendRefund(refund: BackendRefund): RefundRecord {
  return {
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
  };
}

function PaymentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldOpenCreateLink =
    searchParams.get("action") === "create-payment" ||
    searchParams.get("action") === "create-payment-link";

  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  // Drawer state
  const [drawerPayment, setDrawerPayment] = useState<Payment | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [showCreateLinkModal, setShowCreateLinkModal] = useState(shouldOpenCreateLink);
  const [linkAmount, setLinkAmount] = useState("100");
  const [linkCurrency, setLinkCurrency] = useState("USDC");
  const [linkCustomerEmail, setLinkCustomerEmail] = useState("");
  const [linkOrderId, setLinkOrderId] = useState("");
  const [linkDescription, setLinkDescription] = useState("Invoice payment");
  const [linkSuccessUrl, setLinkSuccessUrl] = useState("");
  const [linkCancelUrl, setLinkCancelUrl] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [recentLinks, setRecentLinks] = useState<
    { id: string; url: string; amount: number; currency: string; description?: string; createdAt: string }[]
  >([]);

  // Debounce search
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 400);
  }, []);

  // Real-time payment updates via SSE
  const handlePaymentUpdate = useCallback(
    (event: { paymentId: string; status: Payment["status"]; txHash?: string; fiatEquivalent?: number; fiatCurrency?: string }) => {
      setPayments((prev) =>
        prev.map((p) =>
          p.id === event.paymentId
            ? {
                ...p,
                status: event.status,
                txHash: event.txHash ?? p.txHash,
                fiatEquivalent: event.fiatEquivalent ?? p.fiatEquivalent,
                fiatCurrency: event.fiatCurrency ?? p.fiatCurrency,
              }
            : p,
        ),
      );
    },
    [],
  );

  const { isConnected } = usePaymentUpdates({
    onUpdate: handlePaymentUpdate,
    enabled: true,
  });

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = (await api.payments.list({
        page,
        limit: PAGE_SIZE,
        status: statusFilter,
        currency: currencyFilter,
        search: debouncedSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })) as { data: BackendPayment[]; meta: { total: number } };
      setPayments(result.data.map(mapBackendPayment));
      setTotal(result.meta.total);
    } catch {
      const msg = "Failed to load payments.";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, currencyFilter, debouncedSearch, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, currencyFilter, debouncedSearch, dateFrom, dateTo, amountMin, amountMax]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleRowClick = useCallback((payment: Payment) => {
    setDrawerPayment(payment);
    setIsDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setDrawerPayment(null);
  }, []);

  const handleExportCSV = async () => {
    try {
      const blob = await api.payments.export({
        status: statusFilter,
        currency: currencyFilter,
        search: debouncedSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payments_export_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed. Please try again.");
    }
  };

  const handleOpenCreateLink = () => {
    setShowCreateLinkModal(true);
    if (searchParams.get("action")) router.replace("/dashboard/payments");
  };

  const handleGenerateLink = async () => {
    const email = linkCustomerEmail.trim();
    const amountNumber = Number(linkAmount);
    if (!amountNumber || amountNumber <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    const simpleEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!simpleEmailPattern.test(email)) {
      toast.error("Please enter a valid customer email.");
      return;
    }

    const validateHttpsUrl = (value: string, label: string) => {
      if (!value.trim()) return true;
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:") throw new Error("invalid");
        return true;
      } catch {
        toast.error(`${label} must be a valid https URL.`);
        return false;
      }
    };

    if (!validateHttpsUrl(linkSuccessUrl, "Success URL")) return;
    if (!validateHttpsUrl(linkCancelUrl, "Cancel URL")) return;

    setIsGeneratingLink(true);
    try {
      const response = (await api.payments.create({
        amount: amountNumber,
        currency: linkCurrency,
        customer_email: email,
        order_id: linkOrderId.trim() || undefined,
        description: linkDescription || undefined,
        success_url: linkSuccessUrl || undefined,
        cancel_url: linkCancelUrl || undefined,
      })) as {
        id?: string;
        checkoutUrl?: string;
        checkout_url?: string;
        payment?: { id?: string; checkoutUrl?: string; checkout_url?: string };
      };

      const payment = response?.payment ?? response;
      if (!payment?.id) throw new Error("Payment link could not be created.");

      const url =
        payment.checkoutUrl ??
        payment.checkout_url ??
        `${window.location.origin}/pay/${payment.id}`;

      setGeneratedLink(url);
      setRecentLinks((prev) =>
        [{ id: payment.id!, url, amount: amountNumber, currency: linkCurrency, description: linkDescription || undefined, createdAt: new Date().toISOString() }, ...prev].slice(0, 5),
      );
      toast.success("Payment created successfully.");
      fetchPayments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create payment.");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Payments History</h2>
          <p className="text-muted-foreground">
            View and manage all transactions processed through Fluxapay.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Real-time connection indicator */}
          <div
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            title={isConnected ? "Live updates active" : "Live updates disconnected"}
          >
            {isConnected ? (
              <Wifi className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="hidden sm:inline">{isConnected ? "Live" : "Offline"}</span>
          </div>
          <Button variant="secondary" className="gap-2" onClick={() => router.push("/dashboard/refunds")}>
            Refunds
          </Button>
          <Button variant="secondary" className="gap-2" onClick={handleExportCSV}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button className="gap-2" onClick={handleOpenCreateLink}>
            <Plus className="h-4 w-4" />
            New Payment
          </Button>
        </div>
      </div>

      {recentLinks.length > 0 && (
        <div className="bg-card rounded-2xl border p-6 shadow-sm space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Recent payments</h3>
            <p className="text-xs text-muted-foreground">Checkout links generated in this session.</p>
          </div>
          <div className="space-y-2">
            {recentLinks.map((link) => (
              <div
                key={link.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium break-all">{link.url}</p>
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
                    toast.success("Checkout URL copied to clipboard.");
                  }}
                >
                  Copy
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTableCard
        toolbar={
          <PaymentsFilters
            searchValue={search}
            statusValue={statusFilter}
            currencyValue={currencyFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            amountMin={amountMin}
            amountMax={amountMax}
            onSearchChange={handleSearchChange}
            onStatusChange={(v) => setStatusFilter(v)}
            onCurrencyChange={(v) => setCurrencyFilter(v)}
            onDateFromChange={(v) => setDateFrom(v)}
            onDateToChange={(v) => setDateTo(v)}
            onAmountMinChange={(v) => setAmountMin(v)}
            onAmountMaxChange={(v) => setAmountMax(v)}
          />
        }
        footer={
          <TablePaginationBar
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            loading={loading}
            onPageChange={setPage}
          />
        }
      >
        <PaymentsTable
          isLoading={loading}
          error={loadError}
          payments={payments}
          onRowClick={handleRowClick}
        />
      </DataTableCard>

      {/* Detail Drawer */}
      <PaymentDrawer
        payment={drawerPayment}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />

      <Modal
        isOpen={showCreateLinkModal}
        onClose={() => setShowCreateLinkModal(false)}
        title="Create Payment"
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
              <option value="USDC">USDC</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Customer email</label>
            <input
              type="email"
              value={linkCustomerEmail}
              onChange={(e) => setLinkCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Order ID (optional)</label>
            <input
              type="text"
              value={linkOrderId}
              onChange={(e) => setLinkOrderId(e.target.value)}
              placeholder="ORD-1024"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <input
              type="text"
              value={linkDescription}
              onChange={(e) => setLinkDescription(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Success URL (optional)</label>
            <input
              type="url"
              value={linkSuccessUrl}
              onChange={(e) => setLinkSuccessUrl(e.target.value)}
              placeholder="https://your-site.com/checkout/success"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Cancel URL (optional)</label>
            <input
              type="url"
              value={linkCancelUrl}
              onChange={(e) => setLinkCancelUrl(e.target.value)}
              placeholder="https://your-site.com/checkout/cancel"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleGenerateLink} disabled={isGeneratingLink}>
              {isGeneratingLink ? "Creating..." : "Create Payment"}
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              onClick={async () => {
                if (!generatedLink) return;
                await navigator.clipboard.writeText(generatedLink);
                toast.success("Checkout URL copied to clipboard.");
              }}
              disabled={!generatedLink}
            >
              Copy Checkout URL
            </Button>
          </div>
          {generatedLink && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted p-3 text-xs break-all">
                {generatedLink}
              </div>
              <div className="flex justify-center">
                <div className="bg-background rounded-lg p-3 border">
                  <QRCodeCanvas value={generatedLink} size={160} level="M" includeMargin />
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            New payment for {linkAmount || "0"} {linkCurrency}
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <PaymentsContent />
    </Suspense>
  );
}
