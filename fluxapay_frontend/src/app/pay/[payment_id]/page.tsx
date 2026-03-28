'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, XCircle, CheckCircle } from 'lucide-react';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { PaymentQRCode } from '@/components/checkout/PaymentQRCode';
import { PaymentTimer } from '@/components/checkout/PaymentTimer';
import { PaymentStatus } from '@/components/checkout/PaymentStatus';
import {
  CheckoutBrandingShell,
  DEFAULT_ACCENT,
} from '@/components/checkout/CheckoutBrandingShell';

/**
 * Main checkout page for FluxaPay payment gateway
 * Handles all payment states: loading, error, pending, confirmed, expired
 * Implements real-time status updates (SSE with polling fallback) and auto-redirect on confirmation
 */
export default function CheckoutPage() {
  const params = useParams();
  const paymentId = params.payment_id as string;
  const { payment, loading, error } = usePaymentStatus(paymentId);

  const accentHex = payment?.checkoutAccentColor ?? DEFAULT_ACCENT;
  const showBrandHeader = Boolean(payment && !error);

  // Auto-redirect when payment is confirmed
  useEffect(() => {
    if (payment?.status === 'confirmed' && payment.successUrl) {
      const timer = setTimeout(() => {
        window.location.href = payment.successUrl!;
      }, 2000); // Wait 2 seconds before redirect

      return () => clearTimeout(timer);
    }
  }, [payment?.status, payment?.successUrl]);

  const handleExpire = () => {};

  return (
    <CheckoutBrandingShell
      accentHex={accentHex}
      logoUrl={payment?.checkoutLogoUrl}
      merchantName={payment?.merchantName}
      showBrandHeader={showBrandHeader}
    >
      {loading && (
        <div
          className="flex flex-1 items-center justify-center p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4">
            <Loader2
              aria-hidden="true"
              className="h-12 w-12 animate-spin"
              style={{ color: 'var(--checkout-accent)' }}
            />
            <p className="text-lg text-gray-600">Loading payment details...</p>
          </div>
        </div>
      )}

      {!loading && (error || !payment) && (
        <div
          className="flex flex-1 items-center justify-center p-4"
          role="alert"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
            <XCircle
              aria-hidden="true"
              className="mx-auto mb-4 h-16 w-16 text-red-500"
            />
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              Payment Not Found
            </h1>
            <p className="mb-4 text-gray-600">
              {error ||
                'The payment you are looking for does not exist or has been removed.'}
            </p>
            <p className="text-sm text-gray-500">
              Please check the payment link and try again.
            </p>
          </div>
        </div>
      )}

      {!loading && payment && payment.status === 'confirmed' && (
        <div
          className="flex flex-1 items-center justify-center p-4"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl">
            <CheckCircle
              aria-hidden="true"
              className="mx-auto mb-6 h-20 w-20 animate-pulse text-green-500"
            />
            <h1 className="mb-4 text-3xl font-bold text-gray-900">
              Payment Confirmed!
            </h1>
            <p className="mb-2 text-lg text-gray-600">
              Your payment has been successfully processed.
            </p>
            <p className="text-sm text-gray-500">Redirecting you back...</p>
          </div>
        </div>
      )}

      {!loading && payment && payment.status === 'expired' && (
        <div
          className="flex flex-1 items-center justify-center p-4"
          role="alert"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl">
            <XCircle
              aria-hidden="true"
              className="mx-auto mb-6 h-20 w-20 text-red-500"
            />
            <h1 className="mb-4 text-3xl font-bold text-gray-900">
              Payment Expired
            </h1>
            <p className="mb-2 text-lg text-gray-600">
              This payment link has expired.
            </p>
            <p className="text-sm text-gray-500">
              Please request a new payment link from the merchant.
            </p>
          </div>
        </div>
      )}

      {!loading && payment && payment.status === 'failed' && (
        <div
          className="flex flex-1 items-center justify-center p-4"
          role="alert"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl">
            <XCircle
              aria-hidden="true"
              className="mx-auto mb-6 h-20 w-20 text-red-500"
            />
            <h1 className="mb-4 text-3xl font-bold text-gray-900">
              Payment Failed
            </h1>
            <p className="mb-2 text-lg text-gray-600">
              The payment could not be processed.
            </p>
            <p className="text-sm text-gray-500">
              Please try again or contact support if the problem persists.
            </p>
          </div>
        </div>
      )}

      {!loading && payment && payment.status === 'pending' && (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">
                Complete Your Payment
              </h1>
              {payment.merchantName && (
                <p className="text-gray-600">to {payment.merchantName}</p>
              )}
            </div>

            <div className="mb-6 flex justify-center">
              <PaymentTimer expiresAt={payment.expiresAt} onExpire={handleExpire} />
            </div>

            <div
              className="mb-8 text-center"
              aria-label={`Amount to pay: ${payment.amount} ${payment.currency}`}
            >
              <p className="mb-2 text-sm text-gray-500">Amount to Pay</p>
              <p className="text-3xl font-bold text-gray-900 sm:text-4xl">
                {payment.amount} {payment.currency}
              </p>
              {payment.description && (
                <p className="mt-2 text-sm text-gray-500">{payment.description}</p>
              )}
            </div>

            <div className="mb-8 flex justify-center">
              <PaymentQRCode
                address={payment.address}
                amount={payment.amount}
                memoType={payment.memoType}
                memo={payment.memo}
                size={256}
              />
            </div>

            {payment.memoRequired && (
              <div
                className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
                role="alert"
                aria-live="polite"
              >
                <p className="font-semibold">Memo required</p>
                <p className="mt-1 text-sm">
                  This payment destination requires a memo/tag. Please include the
                  memo exactly as shown, or your payment may not be credited.
                </p>
              </div>
            )}

            <div
              className="mb-6 rounded-lg border p-4 sm:p-6"
              style={{
                borderColor: `color-mix(in srgb, var(--checkout-accent) 40%, transparent)`,
                backgroundColor: `color-mix(in srgb, var(--checkout-accent) 12%, white)`,
              }}
            >
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                How to Pay:
              </h2>
              <ol
                className="space-y-3 text-gray-700"
                aria-label="Payment instructions"
              >
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--checkout-accent)' }}
                  >
                    1
                  </span>
                  <span>Scan the QR code above with your Stellar wallet app</span>
                </li>
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--checkout-accent)' }}
                  >
                    2
                  </span>
                  <span>
                    Confirm the amount and payment address match
                    {payment.memoRequired && payment.memo && (
                      <> (and include the required memo)</>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--checkout-accent)' }}
                  >
                    3
                  </span>
                  <span>Complete the transaction in your wallet</span>
                </li>
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--checkout-accent)' }}
                  >
                    4
                  </span>
                  <span>
                    You will be automatically redirected after confirmation
                  </span>
                </li>
              </ol>
            </div>

            <div className="flex justify-center">
              <PaymentStatus status="pending" />
            </div>

            {/* Footer links (merged from upstream/main) */}
            <div className="mt-8 flex justify-center gap-6 border-t border-gray-100 pt-6 text-xs text-gray-500">
              <Link
                href="/terms"
                className="transition-colors hover:text-[color:var(--checkout-accent)]"
              >
                Terms of Service
              </Link>
              <Link
                href="/privacy"
                className="transition-colors hover:text-[color:var(--checkout-accent)]"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      )}
    </CheckoutBrandingShell>
  );
}
