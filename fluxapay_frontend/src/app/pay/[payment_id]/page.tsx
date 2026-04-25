'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, XCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { PaymentQRCode } from '@/components/checkout/PaymentQRCode';
import { PaymentTimer } from '@/components/checkout/PaymentTimer';
import { PaymentStatus } from '@/components/checkout/PaymentStatus';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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
  const t = useTranslations('payment');
  const tAuth = useTranslations('auth');
  const params = useParams();
  const paymentId = params.payment_id as string;
  const { payment, loading, error, isOffline, retryConnection } =
    usePaymentStatus(paymentId);

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
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher />
      </div>

      {isOffline && (
        <div
          className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {t('checkout.offlineMessage')}
            </p>
            <button
              type="button"
              onClick={() => {
                void retryConnection();
              }}
              className="rounded-md border border-amber-400 bg-white px-3 py-1 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              {t('checkout.retryNow')}
            </button>
          </div>
        </div>
      )}

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
            <p className="text-lg text-gray-600">{t('checkout.loadingDetails')}</p>
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
              {t('checkout.notFound')}
            </h1>
            <p className="mb-4 text-gray-600">
              {error || t('checkout.notFoundDescription')}
            </p>
            <p className="text-sm text-gray-500">
              {t('checkout.checkLink')}
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
              {t('checkout.confirmed')}
            </h1>
            <p className="mb-2 text-lg text-gray-600">
              {t('checkout.confirmedDescription')}
            </p>
            <p className="text-sm text-gray-500">{t('checkout.redirecting')}</p>
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
              {t('checkout.expired')}
            </h1>
            <p className="mb-2 text-lg text-gray-600">
              {t('checkout.expiredDescription')}
            </p>
            <p className="text-sm text-gray-500">
              {t('checkout.requestNew')}
            </p>
            {payment.supportUrl && (
              <div className="mt-8">
                <a
                  href={payment.supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--checkout-accent)] hover:underline"
                >
                  <AlertCircle className="h-4 w-4" />
                  {t('checkout.contactSupport')}
                </a>
              </div>
            )}
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
              {t('failed')}
            </h1>
            <p className="mb-2 text-lg text-gray-600">
              {t('checkout.failedDescription')}
            </p>
            <p className="text-sm text-gray-500">
              {t('checkout.tryAgainOrSupport')}
            </p>
            {payment.supportUrl && (
              <div className="mt-8">
                <a
                  href={payment.supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--checkout-accent)] hover:underline"
                >
                  <AlertCircle className="h-4 w-4" />
                  {t('checkout.contactSupport')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && payment && payment.status === 'partially_paid' && (
        <div
          className="flex flex-1 items-center justify-center p-4"
          role="alert"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl">
            <AlertCircle
              aria-hidden="true"
              className="mx-auto mb-6 h-20 w-20 text-amber-500"
            />
            <h1 className="mb-4 text-3xl font-bold text-gray-900">
              {t('checkout.partialReceived')}
            </h1>
            <p className="mb-2 text-lg text-gray-600">
              {t('checkout.partialDescription', {
                paidAmount: payment.paidAmount ?? 0,
                currency: payment.currency,
                amount: payment.amount
              })}
            </p>
            <p className="mb-6 text-sm text-gray-500">
              {t('checkout.contactMerchantResolve')}
            </p>
            <div className="flex flex-col gap-4">
              {payment.successUrl && (
                <a
                  href={payment.successUrl}
                  className="inline-block rounded-lg px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--checkout-accent)' }}
                >
                  {t('checkout.returnToMerchant')}
                </a>
              )}
              {payment.supportUrl && (
                <a
                  href={payment.supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 text-sm font-medium text-[color:var(--checkout-accent)] hover:underline"
                >
                  <AlertCircle className="h-4 w-4" />
                  {t('checkout.contactSupport')}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && payment && payment.status === 'overpaid' && (
        <div
          className="flex flex-1 items-center justify-center p-4"
          role="alert"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl">
            <AlertCircle
              aria-hidden="true"
              className="mx-auto mb-6 h-20 w-20 text-blue-500"
            />
            <h1 className="mb-4 text-3xl font-bold text-gray-900">
              {t('checkout.overpaymentReceived')}
            </h1>
            <p className="mb-2 text-lg text-gray-600">
              {t('checkout.overpaymentDescription', {
                paidAmount: payment.paidAmount ?? 0,
                currency: payment.currency,
                amount: payment.amount
              })}
            </p>
            <p className="mb-6 text-sm text-gray-500">
              {t('checkout.contactMerchantExcess')}
            </p>
            <div className="flex flex-col gap-4">
              {payment.successUrl && (
                <a
                  href={payment.successUrl}
                  className="inline-block rounded-lg px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--checkout-accent)' }}
                >
                  {t('checkout.returnToMerchant')}
                </a>
              )}
              {payment.supportUrl && (
                <a
                  href={payment.supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 text-sm font-medium text-[color:var(--checkout-accent)] hover:underline"
                >
                  <AlertCircle className="h-4 w-4" />
                  {t('checkout.contactSupport')}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && payment && payment.status === 'pending' && (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">
                {t('checkout.completePayment')}
              </h1>
              {payment.merchantName && (
                <p className="text-gray-600">
                  {t('checkout.toMerchant', { merchantName: payment.merchantName })}
                </p>
              )}
            </div>

            <div className="mb-6 flex justify-center">
              <PaymentTimer expiresAt={payment.expiresAt} onExpire={handleExpire} />
            </div>

            <div
              className="mb-8 text-center"
              aria-label={`${t('checkout.amountToPay')}: ${payment.amount} ${payment.currency}`}
            >
              <p className="mb-2 text-sm text-gray-500">{t('checkout.amountToPay')}</p>
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
                <p className="font-semibold">{t('checkout.memoRequired')}</p>
                <p className="mt-1 text-sm">
                  {t('checkout.memoDescription')}
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
                {t('checkout.howToPay')}
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
                  <span>{t('checkout.step1')}</span>
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
                    {t('checkout.step2')}
                    {payment.memoRequired && payment.memo && (
                      <>{t('checkout.step2Memo')}</>
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
                  <span>{t('checkout.step3')}</span>
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
                    {t('checkout.step4')}
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
                {tAuth('terms')}
              </Link>
              <Link
                href="/privacy"
                className="transition-colors hover:text-[color:var(--checkout-accent)]"
              >
                {tAuth('privacy')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </CheckoutBrandingShell>
  );
}
