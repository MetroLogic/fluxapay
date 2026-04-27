/**
 * Payment status enum values matching backend PaymentStatus enum
 */
export type PaymentStatus = 
  | 'pending' 
  | 'partially_paid' 
  | 'confirmed' 
  | 'overpaid' 
  | 'expired' 
  | 'failed' 
  | 'paid' 
  | 'completed';

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  address: string; // Stellar payment address
  memoType?: 'text' | 'id' | 'hash' | 'return';
  memo?: string;
  memoRequired?: boolean;
  expiresAt: Date;
  status: PaymentStatus;
  paidAmount?: number;
  successUrl?: string;
  merchantName?: string;
  description?: string;
  /** HTTPS logo URL for hosted checkout (merchant settings). */
  checkoutLogoUrl?: string;
  /** Normalized hex accent, e.g. #rrggbb */
  checkoutAccentColor?: string;
  /** Support link for the merchant or Fluxapay. */
  supportUrl?: string;
}

export interface PaymentStatusUpdate {
  paymentId: string;
  status: PaymentStatus;
  timestamp: Date;
}
