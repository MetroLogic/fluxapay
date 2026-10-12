"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Search, ArrowUpRight, ChevronDown, ChevronRight, Plus, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  type RefundRecord,
  type RefundStatus,
} from "@/features/dashboard/refunds/types";
import { RefundStatusTimeline } from "@/features/dashboard/refunds/RefundStatusTimeline";
import { RefundForm } from "@/features/dashboard/refunds/RefundForm";
import { TablePaginationBar } from "@/components/data-table";
import { Suspense, Fragment } from "react";
import toast from "react-hot-toast";

/** Refunds requested per page. Matches the payments list for consistency. */
const PAGE_SIZE = 20;

/** Parse a `page` query param into a usable 1-based page number. */
export function parsePageParam(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

interface BackendRefund {
  id: string;
  payment_id: string;
  merchant_id: string;
  amount: number;
  currency: "USDC" | "XLM";
  customer_address: string;
  reason:
    | "customer_request"
    | "duplicate_payment"
    | "failed_delivery"
    | "merchant_request"
    | "dispute_resolution";
  reason_note?: string;
  status: RefundStatus;
  stellar_tx_hash?: string;
  created_at: string;
  updated_at?: string;
  failed_reason?: string;
}

function RefundsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentIdFromQuery = searchParams.get("paymentId") ?? "";

  const pageFromQuery = parsePageParam(searchParams.get("page"));

  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(paymentIdFromQuery);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showInitiateModal, setShowInitiateModal] = useState(false);
  const [initiateContext, setInitiateContext] = useState<{
    paymentId: string;
    merchantId: string;
    currency: "USDC" | "XLM";
    maxAmount: number;
    customerAddress: string;
  } | null>(null);
  const [isFetchingPayment, setIsFetchingPayment] = useState(false);

  useEffect(() => {
    setSearch(paymentIdFromQuery);
  }, [paymentIdFromQuery]);

  const fetchRefunds = useCallback(async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setError(null);
      // Server-side paging: the previous `limit: 100` pulled the whole list in
      // one query, which does not survive a merchant with thousands of refunds.
      const response = (await api.refunds.list({
        paymentId: paymentIdFromQuery || undefined,
        // Filtered server-side so the "of N" count describes the same set the
        // table is paging through.
        status: statusFilter === "all" ? undefined : (statusFilter as RefundStatus),
        page: pageFromQuery,
        limit: PAGE_SIZE,
        signal,
      })) as {
        refunds?: BackendRefund[];
        total?: number;
        meta?: { total?: number };
      };
      if (Array.isArray(response.refunds)) {
        const mapped = response.refunds.map((item) => ({
          id: item.id,
          paymentId: item.payment_id,
          merchantId: item.merchant_id,
          amount: item.amount,
          currency: item.currency,
          customerAddress: item.customer_address,
          reason: item.reason,
          reasonNote: item.reason_note,
          status: item.status,
          stellarTxHash: item.stellar_tx_hash,
          createdAt: item.created_at,
        }));
        setRefunds(mapped);
        // Backends differ on where the count sits; fall back to the page length
        // so the bar still reads sensibly rather than claiming zero results.
        setTotal(
          response.total ??
            response.meta?.total ??
            (pageFromQuery - 1) * PAGE_SIZE + mapped.length,
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load refunds. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [paymentIdFromQuery, pageFromQuery, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchRefunds(controller.signal);
    return () => controller.abort();
  }, [fetchRefunds]);

  /**
   * Page lives in the URL so a page of refunds can be linked to and survives a
   * refresh or a back-navigation.
   */
  const goToPage = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));
      const query = params.toString();
      router.push(`/dashboard/refunds${query ? `?${query}` : ""}`);
    },
    [router, searchParams],
  );

  const handleStatusFilterChange = useCallback(
    (nextStatus: string) => {
      setStatusFilter(nextStatus);
      // A narrower filter usually has fewer pages; staying on page 4 would show
      // an empty table.
      if (pageFromQuery !== 1) goToPage(1);
    },
    [goToPage, pageFromQuery],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      goToPage(nextPage);
      setExpandedId(null);
    },
    [goToPage],
  );

  const filteredRefunds = useMemo(() => {
    return refunds.filter((refund) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        refund.id.toLowerCase().includes(query) ||
        refund.paymentId.toLowerCase().includes(query) ||
        refund.merchantId.toLowerCase().includes(query);
      // Status is applied by the API; only the free-text search is local.
      return matchesSearch;
    });
  }, [refunds, search]);

  const getStatusBadge = (status: RefundStatus) => {
    if (status === "completed") return <Badge variant="success">Completed</Badge>;
    if (status === "processing") return <Badge variant="warning">Processing</Badge>;
    if (status === "pending") return <Badge variant="info">Pending</Badge>;
    return <Badge variant="error">Failed</Badge>;
  };

  const handleInitiateClick = async (refund: RefundRecord) => {
    setIsFetchingPayment(true);
    try {
      const payment = (await api.payments.getById(refund.paymentId)) as {
        id: string;
        amount: number;
        currency: string;
        merchant_id: string;
        customer_address?: string;
        status: string;
      };
      setInitiateContext({
        paymentId: payment.id,
        merchantId: payment.merchant_id,
        currency: payment.currency as "USDC" | "XLM",
        maxAmount: payment.amount,
        customerAddress: payment.customer_address || "",
      });
      setShowInitiateModal(true);
    } catch {
      toast.error("Failed to load payment details. Navigate to the payment page to initiate a refund.");
    } finally {
      setIsFetchingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Refunds</h2>
          <p className="text-muted-foreground">
            Track full and partial refunds with status and payment references.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="brand"
            onClick={() => router.push("/dashboard/payments")}
          >
            <Plus className="h-4 w-4" />
            Initiate Refund
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/payments")}
          >
            Back to Payments
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 md:p-6">
        <div className="mb-5 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search by refund ID, payment ID or merchant ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            className="w-full md:w-[200px]"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </Select>
        </div>

        <div className="hidden overflow-x-auto md:block">
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3 py-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex animate-pulse gap-4">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-4 w-20 rounded bg-muted" />
                  <div className="h-4 w-16 rounded bg-muted" />
                  <div className="h-4 w-20 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3 font-medium">Refund ID</th>
                <th className="px-3 py-3 font-medium">Payment</th>
                <th className="px-3 py-3 font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRefunds.map((refund) => {
                const isExpanded = expandedId === refund.id;
                return (
                  <Fragment key={refund.id}>
                    <tr className="group">
                      <td className="px-3 py-3">
                        <button
                          onClick={() =>
                            setExpandedId(isExpanded ? null : refund.id)
                          }
                          className="rounded p-1 hover:bg-muted transition-colors"
                          aria-label={isExpanded ? "Collapse timeline" : "Expand timeline"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{refund.id}</td>
                      <td className="px-3 py-3 font-mono text-xs">{refund.paymentId}</td>
                      <td className="px-3 py-3">
                        {refund.amount} {refund.currency}
                      </td>
                      <td className="px-3 py-3">{getStatusBadge(refund.status)}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {new Date(refund.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 px-2"
                            onClick={() => handleInitiateClick(refund)}
                            disabled={isFetchingPayment}
                          >
                            {isFetchingPayment ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="bg-muted/20 px-6 py-4">
                          <RefundStatusTimeline
                            status={refund.status}
                            createdAt={refund.createdAt}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!isLoading && filteredRefunds.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    {error ? "Could not load refunds." : "No refunds found for the selected filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          )}
        </div>

        <div className="space-y-3 md:hidden">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border p-3">
                  <div className="mb-2 flex gap-3">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-4 w-16 rounded bg-muted" />
                  </div>
                  <div className="h-3 w-32 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : (
          <>
          {filteredRefunds.map((refund) => {
            const isExpanded = expandedId === refund.id;
            return (
              <div key={refund.id} className="rounded-xl border p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{refund.id}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Payment: {refund.paymentId}
                    </p>
                  </div>
                  {getStatusBadge(refund.status)}
                </div>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Amount:</span>{" "}
                    {refund.amount} {refund.currency}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(refund.createdAt).toLocaleString()}
                  </p>
                </div>
                {isExpanded && (
                  <div className="mt-3 border-t pt-3">
                    <RefundStatusTimeline
                      status={refund.status}
                      createdAt={refund.createdAt}
                    />
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : refund.id)
                    }
                  >
                    {isExpanded ? "Hide Timeline" : "View Timeline"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={() =>
                      router.push(`/dashboard/payments?paymentId=${refund.paymentId}`)
                    }
                  >
                    Open Payment
                  </Button>
                </div>
              </div>
            );
          })}
          {!isLoading && filteredRefunds.length === 0 && (
            <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">
              {error ? "Could not load refunds." : "No refunds found for the selected filters."}
            </p>
          )}
          </>
          )}
        </div>

        <TablePaginationBar
          page={pageFromQuery}
          pageSize={PAGE_SIZE}
          total={total}
          loading={isLoading}
          onPageChange={handlePageChange}
        />
      </div>

      {initiateContext && (
        <RefundForm
          isOpen={showInitiateModal}
          onClose={() => {
            setShowInitiateModal(false);
            setInitiateContext(null);
          }}
          onSuccess={() => {
            void fetchRefunds();
          }}
          paymentId={initiateContext.paymentId}
          merchantId={initiateContext.merchantId}
          currency={initiateContext.currency}
          maxAmount={initiateContext.maxAmount}
          customerAddress={initiateContext.customerAddress}
        />
      )}
    </div>
  );
}

export default function RefundsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      }
    >
      <RefundsContent />
    </Suspense>
  );
}
