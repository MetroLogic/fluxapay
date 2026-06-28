"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Search, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import {
  MOCK_REFUNDS,
  type RefundRecord,
  type RefundStatus,
} from "@/features/dashboard/refunds/refunds-mock";
import { Suspense } from "react";

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
}

function RefundsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paymentIdFromQuery = searchParams.get("paymentId") ?? "";

  const [refunds, setRefunds] = useState<RefundRecord[]>(MOCK_REFUNDS);
  const [search, setSearch] = useState(paymentIdFromQuery);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setSearch(paymentIdFromQuery);
  }, [paymentIdFromQuery]);

  useEffect(() => {
    const fetchRefunds = async () => {
      try {
        setIsLoading(true);
        const response = (await api.refunds.list({
          paymentId: paymentIdFromQuery || undefined,
          limit: 100,
        })) as { refunds?: BackendRefund[] };
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
        }
      } catch {
        setRefunds(MOCK_REFUNDS);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchRefunds();
  }, [paymentIdFromQuery]);

  const filteredRefunds = useMemo(() => {
    return refunds.filter((refund) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        refund.id.toLowerCase().includes(query) ||
        refund.paymentId.toLowerCase().includes(query) ||
        refund.merchantId.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" || refund.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [refunds, search, statusFilter]);

  const getStatusBadge = (status: RefundStatus) => {
    if (status === "completed") return <Badge variant="success">Completed</Badge>;
    if (status === "processing") return <Badge variant="warning">Processing</Badge>;
    if (status === "initiated") return <Badge variant="info">Initiated</Badge>;
    return <Badge variant="error">Failed</Badge>;
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
        <Button
          variant="secondary"
          onClick={() => router.push("/dashboard/payments")}
        >
          Back to Payments
        </Button>
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
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="initiated">Initiated</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </Select>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-3 font-medium">Refund ID</th>
                <th className="px-3 py-3 font-medium">Payment</th>
                <th className="px-3 py-3 font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRefunds.map((refund) => (
                <tr key={refund.id}>
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        router.push(
                          `/dashboard/payments?paymentId=${refund.paymentId}`,
                        )
                      }
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && filteredRefunds.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No refunds found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredRefunds.map((refund) => (
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
              <Button
                size="sm"
                variant="secondary"
                className="mt-3 w-full"
                onClick={() =>
                  router.push(`/dashboard/payments?paymentId=${refund.paymentId}`)
                }
              >
                Open Payment
              </Button>
            </div>
          ))}
          {!isLoading && filteredRefunds.length === 0 && (
            <p className="rounded-xl border p-4 text-center text-sm text-muted-foreground">
              No refunds found for the selected filters.
            </p>
          )}
        </div>
      </div>
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
