'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { Copy } from 'lucide-react';
import toast from 'react-hot-toast';

interface PaymentQRCodeProps {
  address: string;
  amount: number;
  memoType?: 'text' | 'id' | 'hash' | 'return';
  memo?: string;
  size?: number;
}

/**
 * Component to display Stellar payment QR code
 * Formats the QR data as a Stellar URI for wallet compatibility
 */
export function PaymentQRCode({ address, amount, memoType, memo, size = 256 }: PaymentQRCodeProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard.`);
  };

  const query = new URLSearchParams({ amount: String(amount) });
  if (memo && memoType) {
    query.set('memo', memo);
    query.set('memo_type', memoType);
  }

  // Keep existing scheme for compatibility with current wallets
  const stellarUri = `stellar:${address}?${query.toString()}`;

  return (
    <div className="flex flex-col items-center space-y-4">
      {/* QR Code Card */}
      <div
        role="img"
        aria-label={`QR code for Stellar payment of ${amount} to address ${address}`}
        className="bg-white rounded-lg shadow-lg p-6 flex items-center justify-center"
      >
        <QRCodeCanvas
          value={stellarUri}
          size={size}
          level="M"
          includeMargin={true}
          className="rounded"
        />
      </div>

      {/* Payment Address */}
      <div className="w-full max-w-md">
        <p className="text-xs text-gray-500 text-center mb-1" id="payment-address-label">Payment Address</p>
        <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded border">
          <p
            className="text-sm text-gray-700 break-all font-mono text-center flex-1"
            aria-labelledby="payment-address-label"
          >
            {address}
          </p>
          <button
            type="button"
            onClick={() => copyToClipboard(address, 'Address')}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
            aria-label="Copy payment address"
          >
            <Copy className="w-3 h-3" aria-hidden="true" />
            Copy
          </button>
        </div>
      </div>

      {memo && memoType && (
        <div className="w-full max-w-md">
          <p className="text-xs text-gray-500 text-center mb-1" id="payment-memo-label">
            Memo ({memoType})
          </p>
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded border">
            <p
              className="text-sm text-gray-700 break-all font-mono text-center flex-1"
              aria-labelledby="payment-memo-label"
            >
              {memo}
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard(memo, 'Memo')}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
              aria-label="Copy memo"
            >
              <Copy className="w-3 h-3" aria-hidden="true" />
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
