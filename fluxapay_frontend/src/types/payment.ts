export interface Payment {
  id: string;
  amount: number;
  currency: string;
  address: string; // Stellar payment address
  expiresAt: Date;
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  successUrl?: string;
  merchantName?: string;
  description?: string;
}

export interface PaymentStatusUpdate {
  paymentId: string;
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  timestamp: Date;
}
