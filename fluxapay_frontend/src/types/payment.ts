export interface Payment {
  id: string;
  amount: number;
  currency: string;
  address: string; // Stellar payment address
  memoType?: 'text' | 'id' | 'hash' | 'return';
  memo?: string;
  memoRequired?: boolean;
  expiresAt: Date;
  status: 'pending' | 'confirmed' | 'expired' | 'failed' | 'partially_paid' | 'overpaid';
  paidAmount?: number;
  merchantContact?: string;
  successUrl?: string;
  merchantName?: string;
  description?: string;
}

export interface PaymentStatusUpdate {
  paymentId: string;
  status: 'pending' | 'confirmed' | 'expired' | 'failed' | 'partially_paid' | 'overpaid';
  paidAmount?: number;
  timestamp: Date;
}
