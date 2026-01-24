export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded';

export type PaymentEventType = 'on-chain' | 'off-chain' | 'system';

export interface PaymentEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  type: PaymentEventType;
  txHash?: string;
  meta?: Record<string, any>;
}

export interface Payment {
  id: string;
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  networkTxHash?: string;
  createdAt: string;
  updatedAt: string;
  settlementId?: string;
  events: PaymentEvent[];
}

export interface PaymentFilterState {
  merchant?: string;
  status?: PaymentStatus | 'all';
  dateRange?: {
    from: Date | undefined;
    to: Date | undefined;
  };
}
