'use client';

import { QRCodeCanvas } from 'qrcode.react';

interface PaymentQRCodeProps {
  address: string;
  amount: number;
  size?: number;
}

/**
 * Component to display Stellar payment QR code
 * Formats the QR data as a Stellar URI for wallet compatibility
 */
export function PaymentQRCode({ address, amount, size = 256 }: PaymentQRCodeProps) {
  // Format as Stellar URI: stellar:address?amount=amount
  const stellarUri = `stellar:${address}?amount=${amount}`;

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
        <p
          className="text-sm text-gray-700 text-center break-all font-mono bg-gray-50 px-3 py-2 rounded border"
          aria-labelledby="payment-address-label"
        >
          {address}
        </p>
      </div>
    </div>
  );
}
