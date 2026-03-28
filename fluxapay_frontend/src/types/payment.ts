export interface Payment {
  id: string;
  amount: number;
  currency: string;
  address: string; // Stellar payment address
  memoType?: 'text' | 'id' | 'hash' | 'return';
  memo?: string;
  memoRequired?: boolean;
  expiresAt: Date;
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  successUrl?: string;
  merchantName?: string;
  description?: string;
  /** HTTPS logo URL for hosted checkout (merchant settings). */
  checkoutLogoUrl?: string;
  /** Normalized hex accent, e.g. #rrggbb */
  checkoutAccentColor?: string;
}

export interface PaymentStatusUpdate {
  paymentId: string;
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  timestamp: Date;
}
