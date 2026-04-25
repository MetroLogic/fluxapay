"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface CheckoutWidgetConfig {
  paymentId: string;
  amount: number;
  currency: string;
  merchantName?: string;
  description?: string;
  customization?: {
    primaryColor?: string;
    logoUrl?: string;
    accentColor?: string;
  };
  callbacks?: {
    onSuccess?: (paymentId: string) => void;
    onCancel?: () => void;
    onError?: (error: string) => void;
  };
}

interface CheckoutWidgetProps extends CheckoutWidgetConfig {
  mode?: "modal" | "embedded";
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function CheckoutWidget({
  paymentId,
  amount,
  currency,
  merchantName,
  customization,
  callbacks,
  mode = "modal",
  containerRef,
}: CheckoutWidgetProps) {
  const t = useTranslations("payment.checkout");
  const [isOpen, setIsOpen] = useState(mode === "embedded");
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (typeof window !== "undefined" && !event.origin.includes(window.location.host)) {
        if (!event.origin.includes("fluxapay")) return;
      }

      const { type, data } = event.data;

      switch (type) {
        case "payment.success":
          callbacks?.onSuccess?.(data.paymentId);
          if (mode === "modal") setIsOpen(false);
          break;
        case "payment.cancel":
          callbacks?.onCancel?.();
          if (mode === "modal") setIsOpen(false);
          break;
        case "payment.error":
          callbacks?.onError?.(data.error);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [callbacks, mode]);

  const checkoutUrl = new URL(
    `${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")}/pay/${paymentId}`
  );

  // Pass customization as query params
  if (customization?.primaryColor) {
    checkoutUrl.searchParams.set("primaryColor", customization.primaryColor);
  }
  if (customization?.logoUrl) {
    checkoutUrl.searchParams.set("logoUrl", customization.logoUrl);
  }
  if (customization?.accentColor) {
    checkoutUrl.searchParams.set("accentColor", customization.accentColor);
  }

  if (mode === "embedded" && containerRef) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full rounded-lg overflow-hidden border border-slate-200"
        aria-busy={isLoading}
        aria-live="polite"
      >
        {isLoading && (
          <div className="w-full h-full p-6 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={checkoutUrl.toString()}
          className="w-full h-full border-none"
          title="FluxaPay Checkout"
          allow="payment"
          onLoad={() => setIsLoading(false)}
          style={{ display: isLoading ? 'none' : 'block' }}
        />
      </div>
    );
  }

  const triggerAccent = customization?.accentColor || customization?.primaryColor || '#d97706'; // bg-amber-600

  // Modal mode
  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-6 py-2 text-white rounded-lg transition-all hover:opacity-90 font-medium shadow-sm active:scale-[0.98]"
        style={{ backgroundColor: triggerAccent }}
      >
        {t("payAmount", { amount, currency })}
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={modalRef}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden animate-in zoom-in-95 fade-in duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                {customization?.logoUrl && (
                  <img src={customization.logoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
                )}
                <div>
                  {merchantName && (
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{t("paymentTo")}</p>
                  )}
                  <h2 className="text-base font-bold text-slate-900 leading-tight">
                    {merchantName || t("completePayment")}
                  </h2>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-slate-50 rounded-full transition-colors"
                aria-label={t("close")}
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>


            {/* Iframe */}
            <div className="h-[calc(90vh-80px)] overflow-hidden" aria-busy={isLoading} aria-live="polite">
              {isLoading && (
                <div className="w-full h-full p-6 space-y-4">
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={checkoutUrl.toString()}
                className="w-full h-full border-none"
                title="FluxaPay Checkout"
                allow="payment"
                onLoad={() => setIsLoading(false)}
                style={{ display: isLoading ? 'none' : 'block' }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
