'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, XCircle, CheckCircle } from 'lucide-react';
import { usePaymentStatus } from '@/hooks/usePaymentStatus';
import { PaymentQRCode } from '@/components/checkout/PaymentQRCode';
import { PaymentTimer } from '@/components/checkout/PaymentTimer';
import { PaymentStatus } from '@/components/checkout/PaymentStatus';

/**
 * Main checkout page for FluxaPay payment gateway
 * Handles all payment states: loading, error, pending, confirmed, expired
 * Implements real-time status polling and auto-redirect on confirmation
 */
export default function CheckoutPage() {
  const params = useParams();
  const paymentId = params.payment_id as string;
  const { payment, loading, error } = usePaymentStatus(paymentId);

  // Auto-redirect when payment is confirmed
  useEffect(() => {
    if (payment?.status === 'confirmed' && payment.successUrl) {
      const timer = setTimeout(() => {
        window.location.href = payment.successUrl!;
      }, 2000); // Wait 2 seconds before redirect

      return () => clearTimeout(timer);
    }
  }, [payment?.status, payment?.successUrl]);

  // Handle timer expiration
  const handleExpire = () => {
    // The polling will update the status to 'expired' automatically
    // This callback is mainly for any additional logic if needed
  };

  // LOADING STATE
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <p className="text-gray-600 text-lg">Loading payment details...</p>
        </div>
      </div>
    );
  }

  // ERROR STATE
  if (error || !payment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Not Found</h1>
          <p className="text-gray-600 mb-4">
            {error || 'The payment you are looking for does not exist or has been removed.'}
          </p>
          <p className="text-sm text-gray-500">
            Please check the payment link and try again.
          </p>
        </div>
      </div>
    );
  }

  // CONFIRMED STATE
  if (payment.status === 'confirmed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full text-center">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6 animate-pulse" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Payment Confirmed!</h1>
          <p className="text-lg text-gray-600 mb-2">
            Your payment has been successfully processed.
          </p>
          <p className="text-sm text-gray-500">
            Redirecting you back...
          </p>
        </div>
      </div>
    );
  }

  // EXPIRED STATE
  if (payment.status === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full text-center">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Payment Expired</h1>
          <p className="text-lg text-gray-600 mb-2">
            This payment link has expired.
          </p>
          <p className="text-sm text-gray-500">
            Please request a new payment link from the merchant.
          </p>
        </div>
      </div>
    );
  }

  // FAILED STATE
  if (payment.status === 'failed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full text-center">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Payment Failed</h1>
          <p className="text-lg text-gray-600 mb-2">
            The payment could not be processed.
          </p>
          <p className="text-sm text-gray-500">
            Please try again or contact support if the problem persists.
          </p>
        </div>
      </div>
    );
  }

  // PENDING STATE (Waiting for payment)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Complete Your Payment
          </h1>
          {payment.merchantName && (
            <p className="text-gray-600">to {payment.merchantName}</p>
          )}
        </div>

        {/* Timer */}
        <div className="flex justify-center mb-6">
          <PaymentTimer expiresAt={payment.expiresAt} onExpire={handleExpire} />
        </div>

        {/* Amount Display */}
        <div className="text-center mb-8">
          <p className="text-sm text-gray-500 mb-2">Amount to Pay</p>
          <p className="text-4xl font-bold text-gray-900">
            {payment.amount} {payment.currency}
          </p>
          {payment.description && (
            <p className="text-sm text-gray-500 mt-2">{payment.description}</p>
          )}
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-8">
          <PaymentQRCode
            address={payment.address}
            amount={payment.amount}
            size={256}
          />
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            How to Pay:
          </h2>
          <ol className="space-y-3 text-gray-700">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                1
              </span>
              <span>Scan the QR code above with your Stellar wallet app</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                2
              </span>
              <span>Confirm the amount and payment address match</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                3
              </span>
              <span>Complete the transaction in your wallet</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                4
              </span>
              <span>You will be automatically redirected after confirmation</span>
            </li>
          </ol>
        </div>

        {/* Status Indicator */}
        <div className="flex justify-center">
          <PaymentStatus status="pending" />
        </div>
      </div>
    </div>
  );
}
