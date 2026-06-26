'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, XCircle, CheckCircle, Calendar, User, Receipt, AlertCircle } from 'lucide-react';
import { CheckoutBrandingShell, DEFAULT_ACCENT } from '@/components/checkout/CheckoutBrandingShell';
import { PaymentQRCode } from '@/components/checkout/PaymentQRCode';
import { PaymentTimer } from '@/components/checkout/PaymentTimer';
import { StellarPayButton } from '@/components/checkout/StellarPayButton';
import { BrowserWalletButtons } from '@/components/checkout/BrowserWalletButtons';
import { FiatEquivalent } from '@/components/checkout/FiatEquivalent';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface InvoicePaymentData {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  line_items: LineItem[];
  total_amount: number;
  currency: string;
  due_date: string;
  notes?: string;
  status: string;
  payment_link: string;
  // Linked payment fields
  payment?: {
    id: string;
    address: string;
    memo?: string;
    memoType?: string;
    memoRequired?: boolean;
    expiresAt: string;
    status: string;
    amount: number;
    transactionHash?: string;
  };
  merchantName?: string;
  checkoutLogoUrl?: string;
  checkoutAccentColor?: string;
}

async function fetchInvoicePublic(invoiceId: string): Promise<InvoicePaymentData> {
  // The invoice route requires API key auth. The invoice_id from the payment_link
  // (e.g. /pay/invoice/INV-...) maps to invoice_number. We call the backend
  // public-facing invoice lookup which is accessible via the payment link context.
  const res = await fetch(`${API_BASE}/api/v1/invoices/${invoiceId}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(res.status === 404 ? 'Invoice not found' : 'Failed to load invoice');
  const json = await res.json();
  const inv = json.data ?? json;
  return {
    id: String(inv.id),
    invoice_number: String(inv.invoice_number ?? inv.id),
    customer_name: String(inv.metadata?.customer_name ?? inv.customer_name ?? ''),
    customer_email: String(inv.customer_email ?? ''),
    line_items: (inv.metadata?.line_items ?? inv.line_items ?? []) as LineItem[],
    total_amount: Number(inv.amount ?? inv.total_amount ?? 0),
    currency: String(inv.currency ?? 'USDC'),
    due_date: String(inv.due_date ?? ''),
    notes: inv.metadata?.notes ?? inv.notes,
    status: String(inv.status ?? 'pending'),
    payment_link: String(inv.payment_link ?? ''),
    payment: inv.payment
      ? {
          id: String(inv.payment.id),
          address: String(inv.payment.address ?? inv.payment.deposit_address ?? ''),
          memo: inv.payment.memo,
          memoType: inv.payment.memoType ?? inv.payment.memo_type,
          memoRequired: Boolean(inv.payment.memoRequired ?? inv.payment.memo_required),
          expiresAt: String(inv.payment.expiresAt ?? inv.payment.expires_at ?? ''),
          status: String(inv.payment.status ?? 'pending'),
          amount: Number(inv.payment.amount ?? inv.amount ?? 0),
          transactionHash: inv.payment.transactionHash ?? inv.payment.transaction_hash,
        }
      : undefined,
    merchantName: inv.merchantName ?? inv.merchant?.business_name,
    checkoutLogoUrl: inv.checkoutLogoUrl ?? inv.merchant?.checkout_logo_url,
    checkoutAccentColor: inv.checkoutAccentColor ?? inv.merchant?.checkout_accent_color,
  };
}

export default function InvoicePaymentPage() {
  const params = useParams();
  const invoiceId = params.invoice_id as string;

  const [invoice, setInvoice] = useState<InvoicePaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchInvoicePublic(invoiceId);
      setInvoice(data);
      if (data.payment?.status === 'confirmed' || data.payment?.status === 'paid' || data.status === 'paid') {
        setPaymentConfirmed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { void load(); }, [load]);

  // Poll payment status every 5s until confirmed
  useEffect(() => {
    if (!invoice?.payment?.id || paymentConfirmed) return;
    const terminal = ['confirmed', 'paid', 'expired', 'failed'];
    if (terminal.includes(invoice.payment.status)) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/payments/${invoice.payment!.id}/status`);
        if (!res.ok) return;
        const data = await res.json() as { status?: string };
        const newStatus = data.status;
        if (newStatus && newStatus !== invoice.payment!.status) {
          setInvoice(prev => prev ? { ...prev, payment: { ...prev.payment!, status: newStatus } } : prev);
          if (newStatus === 'confirmed' || newStatus === 'paid') {
            setPaymentConfirmed(true);
          }
        }
      } catch { /* ignore */ }
    }, 5000);

    return () => clearInterval(timer);
  }, [invoice, paymentConfirmed]);

  const accentHex = invoice?.checkoutAccentColor || DEFAULT_ACCENT;

  return (
    <CheckoutBrandingShell
      accentHex={accentHex}
      logoUrl={invoice?.checkoutLogoUrl}
      merchantName={invoice?.merchantName}
      showBrandHeader={Boolean(invoice && !error)}
    >
      {loading && (
        <div className="flex flex-1 items-center justify-center p-4" role="status">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin" style={{ color: 'var(--checkout-accent)' }} />
            <p className="text-lg text-gray-600">Loading invoice…</p>
          </div>
        </div>
      )}

      {!loading && (error || !invoice) && (
        <div className="flex flex-1 items-center justify-center p-4" role="alert">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
            <XCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Invoice Not Found</h1>
            <p className="text-gray-600">{error || 'This invoice link is invalid or has expired.'}</p>
          </div>
        </div>
      )}

      {!loading && invoice && paymentConfirmed && (
        <div className="flex flex-1 items-center justify-center p-4" role="status">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 text-center shadow-xl">
            <CheckCircle className="mx-auto mb-6 h-20 w-20 animate-pulse text-green-500" />
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Payment Received!</h1>
            <p className="mb-2 text-lg text-gray-600">
              Invoice <strong>{invoice.invoice_number}</strong> has been paid.
            </p>
            <p className="text-sm text-gray-500">Thank you for your payment.</p>
          </div>
        </div>
      )}

      {!loading && invoice && !paymentConfirmed && (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-2xl space-y-6">
            {/* Invoice Header Card */}
            <div className="rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Invoice</p>
                  <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Total Due</p>
                  <p className="text-3xl font-bold" style={{ color: 'var(--checkout-accent)' }}>
                    {invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                  </p>
                  <FiatEquivalent usdcAmount={invoice.total_amount} />
                </div>
              </div>

              {/* Meta row */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">Customer</p>
                    <p className="font-medium">{invoice.customer_name || invoice.customer_email}</p>
                  </div>
                </div>
                {invoice.due_date && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-400">Due Date</p>
                      <p className="font-medium">
                        {new Date(invoice.due_date).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Line Items */}
            {invoice.line_items.length > 0 && (
              <div className="rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center gap-2 mb-4 font-semibold text-gray-900">
                  <Receipt className="h-4 w-4" />
                  Line Items
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium text-gray-500">Description</th>
                      <th className="py-2 text-right font-medium text-gray-500">Qty</th>
                      <th className="py-2 text-right font-medium text-gray-500">Unit Price</th>
                      <th className="py-2 text-right font-medium text-gray-500">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {invoice.line_items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-2">{item.description}</td>
                        <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                        <td className="py-2 text-right tabular-nums">{Number(item.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 text-right tabular-nums font-medium">
                          {(item.quantity * item.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td colSpan={3} className="py-2 text-right font-semibold">Total</td>
                      <td className="py-2 text-right font-bold tabular-nums">
                        {invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {invoice.currency}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {invoice.notes && (
                  <p className="mt-3 text-sm text-gray-500 border-t pt-3">{invoice.notes}</p>
                )}
              </div>
            )}

            {/* Payment Section */}
            {invoice.payment && invoice.payment.address ? (
              <div className="rounded-2xl bg-white p-6 shadow-xl space-y-5">
                <h2 className="text-lg font-semibold text-gray-900">Complete Payment</h2>

                {invoice.payment.expiresAt && (
                  <div className="flex justify-center">
                    <PaymentTimer expiresAt={new Date(invoice.payment.expiresAt)} onExpire={() => {}} />
                  </div>
                )}

                <div className="flex justify-center">
                  <PaymentQRCode
                    address={invoice.payment.address}
                    amount={invoice.payment.amount}
                    memoType={invoice.payment.memoType as 'text' | 'id' | 'hash' | undefined}
                    memo={invoice.payment.memo}
                    size={200}
                  />
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border bg-gray-50 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-500">Payment Address</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(invoice.payment!.address)}
                        className="text-xs font-medium hover:underline focus:outline-none"
                        style={{ color: 'var(--checkout-accent)' }}
                      >
                        Copy
                      </button>
                    </div>
                    <p className="font-mono text-sm break-all">{invoice.payment.address}</p>
                  </div>
                  {invoice.payment.memo && (
                    <div className="rounded-lg border bg-gray-50 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-gray-500">
                          Memo
                          {invoice.payment.memoRequired && <span className="text-red-500 ml-1">*Required</span>}
                        </p>
                        <button
                          onClick={() => navigator.clipboard.writeText(invoice.payment!.memo!)}
                          className="text-xs font-medium hover:underline focus:outline-none"
                          style={{ color: 'var(--checkout-accent)' }}
                        >
                          Copy
                        </button>
                      </div>
                      <p className="font-mono text-sm">{invoice.payment.memo}</p>
                    </div>
                  )}
                </div>

                {invoice.payment.memoRequired && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-amber-800">
                        <strong>Memo is required.</strong> You must include the exact memo when sending the payment or it will not be credited.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-center">
                  <StellarPayButton
                    address={invoice.payment.address}
                    amount={invoice.payment.amount}
                    memo={invoice.payment.memo}
                    memoType={invoice.payment.memoType}
                  />
                </div>

                <BrowserWalletButtons
                  address={invoice.payment.address}
                  amount={invoice.payment.amount}
                  memo={invoice.payment.memo}
                  memoType={invoice.payment.memoType}
                  paymentId={invoice.payment.id}
                  onPaymentConfirmed={(txHash) => {
                    setInvoice(prev =>
                      prev ? { ...prev, payment: { ...prev.payment!, status: 'confirmed', transactionHash: txHash } } : prev
                    );
                    setPaymentConfirmed(true);
                  }}
                />
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-6 shadow-xl text-center text-gray-500">
                <p className="text-sm">Payment details are not available yet. Please check back shortly.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </CheckoutBrandingShell>
  );
}
