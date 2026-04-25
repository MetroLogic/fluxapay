"use client";

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
  containerRef?: React.RefObject<HTMLDivElement>;
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
      if (!event.origin.includes("fluxapay")) return;

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
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/pay/${paymentId}`
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

  // Modal mode
  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
      >
        {t("payAmount", { amount, currency })}
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={modalRef}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                {merchantName && (
                  <p className="text-sm text-slate-500">{t("paymentTo")}</p>
                )}
                <h2 className="text-lg font-bold text-slate-900">
                  {merchantName || t("completePayment")}
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label={t("close")}
              >
                <X className="h-5 w-5 text-slate-500" />
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
