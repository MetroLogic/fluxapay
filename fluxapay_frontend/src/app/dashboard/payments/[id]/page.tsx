"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { PaymentDetails } from "@/features/dashboard/payments/PaymentDetails";
import { type Payment } from "@/features/dashboard/payments/payments-mock";
import { type RefundRecord, type RefundReason } from "@/features/dashboard/refunds/refunds-mock";
import { Button } from "@/components/Button";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

interface BackendPayment {
  id: string;
  amount: number;
  currency: string;
  status: Payment["status"];
  merchantId: string;
  customer_email: string;
  order_id?: string;
  createdAt: string;
  depositAddress?: string;
  transaction_hash?: string;
  sweep_status?: string;
  settlement_linkage?: unknown;
  stellar_expert_url?: string;
}

function mapBackendPayment(p: BackendPayment): Payment {
  return {
    id: p.id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    merchantId: p.merchantId,
    customerName: "", // Backend might not provide this directly
    customerEmail: p.customer_email ?? "",
    customerAddress: "",
    orderId: p.order_id ?? "",
    createdAt: p.createdAt,
    depositAddress: p.depositAddress ?? "",
    txHash: p.transaction_hash,
    sweepStatus: p.sweep_status,
    settlementLinkage: p.settlement_linkage,
    stellarExpertUrl: p.stellar_expert_url,
  };
}

export default function PaymentDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPaymentDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = (await api.payments.getById(id as string)) as any;
      const data = response.payment || response.data || response;
      setPayment(mapBackendPayment(data));
      
      // Fetch refunds for this payment if available
      try {
        const refundsResponse = (await api.refunds.list({ paymentId: id as string })) as any;
        setRefunds(refundsResponse.data || refundsResponse.refunds || []);
      } catch (e) {
        console.error("Failed to fetch refunds", e);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to load payment details";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchPaymentDetails();
  }, [id]);

  const handleInitiateRefund = async (payload: any) => {
    try {
      await api.refunds.initiate(payload);
      toast.success("Refund initiated successfully");
      fetchPaymentDetails(); // Refresh
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to initiate refund");
      throw err;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading payment details...</p>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 text-center">
        <div className="p-4 rounded-full bg-red-50 text-red-600">
          <RefreshCw className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Error Loading Payment</h2>
          <p className="text-muted-foreground max-w-md">{error || "Payment not found"}</p>
        </div>
        <Button onClick={() => router.back()} variant="outline">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={() => router.back()} variant="outline" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Payment {payment.id}</h2>
            <p className="text-sm text-muted-foreground">
              View full transaction history and manage refunds
            </p>
          </div>
        </div>
        <Button onClick={fetchPaymentDetails} variant="secondary" size="sm">
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="max-w-5xl mx-auto">
        <PaymentDetails
          payment={payment}
          refunds={refunds}
          onCreateRefund={handleInitiateRefund}
          onOpenRefundsSection={() => router.push(`/dashboard/refunds?paymentId=${payment.id}`)}
        />
      </div>
    </div>
  );
}
