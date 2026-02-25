export interface ReconciliationPeriod {
  startDate: Date;
  endDate: Date;
  totalUSDCReceived: number;
  totalFiatPayout: number;
  totalFees: number;
  transactionCount: number;
  discrepancy: number;
  status: 'balanced' | 'discrepancy' | 'pending';
}

export interface Settlement {
  id: string;
  date: Date;
  usdcAmount: number;
  fiatAmount: number;
  currency: string;
  fees: number;
  status: 'completed' | 'pending' | 'failed';
}

export interface ReconciliationRecord {
  id: string;
  settlementId: string;
  date: Date;
  usdcReceived: number;
  fiatPayout: number;
  fees: number;
  discrepancy: number;
  notes?: string;
}

export interface DiscrepancyAlert {
  id: string;
  settlementId: string;
  type: 'overpayment' | 'underpayment' | 'missing_transaction';
  amount: number;
  description: string;
  date: Date;
  resolved: boolean;
}
