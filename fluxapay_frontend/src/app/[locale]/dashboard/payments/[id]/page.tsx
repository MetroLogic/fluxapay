"use client";

import React, { useCallback, useEffect, useState } from "react";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, InitiateRefundRequest } from "@/lib/api";
import { PaymentDetails } from "@/features/dashboard/payments/PaymentDetails";
import { type Payment } from "@/features/dashboard/payments/types";
import { type RefundRecord } from "@/features/dashboard/refunds/types";
import { Button } from "@/components/Button";
import DashboardNotFound from "../../not-found";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { mapBackendPayment, type BackendPayment } from "./mapBackendPayment";

export default function PaymentDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFoundError, setNotFoundError] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("details");

  const fetchPaymentDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.payments.getById(id as string);
      if ("error" in response) {
        if (response.error.status === 404) {
          setNotFoundError(true);
          return;
        }
        if (response.error.status >= 500) {
          setServerError(true);
          return;
        }
        throw response.error;
      }
      const rawData = response.data as Record<string, unknown>;
      const data = rawData
        ? ((rawData.payment || rawData.data || rawData) as BackendPayment)
        : null;
      setPayment(mapBackendPayment(data));
      
      // Fetch refunds for this payment if available
      try {
        const refundsResponse = await api.refunds.list({ paymentId: id as string });
        if (!("error" in refundsResponse)) {
          const rData = refundsResponse.data as Record<string, unknown>;
          setRefunds((rData.data || rData.refunds || []) as RefundRecord[]);
        }
      } catch (e) {
        console.error("Failed to fetch refunds", e);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFoundError(true);
        return;
      }
      if (err instanceof ApiError && err.status >= 500) {
        setServerError(true);
        return;
      }
      const msg = err instanceof ApiError ? err.message : "Failed to load payment details";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchPaymentDetails();
  }, [id, fetchPaymentDetails]);

  // Set active tab from query parameter on mount
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "refunds") {
      setActiveTab("refunds");
    }
  }, [searchParams]);

  const handleInitiateRefund = async (payload: InitiateRefundRequest) => {
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

  if (serverError) {
    throw new Error(error || "Failed to load payment details");
  }

  if (notFoundError) {
    return (
      <DashboardNotFound
        title="Payment not found"
        message="The payment you are looking for does not exist."
        href="/dashboard/payments"
        linkLabel="Return to Payments"
      />
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
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}
