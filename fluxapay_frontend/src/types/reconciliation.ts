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

/** --- Backend API shapes (`GET /api/v1/admin/reconciliation/...`) --- */

export interface ReconciliationRecordApi {
  id: string;
  merchantId: string;
  period_start: string;
  period_end: string;
  expected_total: string | number;
  actual_total: string | number;
  discrepancy_amount: string | number;
  discrepancy_percent: string | number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface DiscrepancyAlertApi {
  id: string;
  merchantId: string;
  reconciliationRecordId: string;
  thresholdId?: string | null;
  severity: string;
  message: string;
  is_resolved: boolean;
  resolved_at?: string | null;
  created_at: string;
  updated_at?: string;
  reconciliationRecord?: ReconciliationRecordApi;
}

export interface ReconciliationSummaryApiResponse {
  message: string;
  data: {
    period_start: string;
    period_end: string;
    merchant_count: number;
    expected_total: number;
    actual_total: number;
    discrepancy_amount: number;
    discrepancy_count: number;
    records: ReconciliationRecordApi[];
  };
}

export interface DiscrepancyAlertsApiResponse {
  message: string;
  data: {
    alerts: DiscrepancyAlertApi[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
  };
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mapReconciliationRecordApiToUi(
  r: ReconciliationRecordApi,
): ReconciliationRecord {
  const expected = num(r.expected_total);
  const actual = num(r.actual_total);
  const disc = num(r.discrepancy_amount);
  return {
    id: r.id,
    settlementId: r.id,
    date: new Date(r.period_end),
    usdcReceived: expected,
    fiatPayout: actual,
    fees: 0,
    discrepancy: disc,
    notes: r.status,
  };
}

function inferAlertType(
  rec: ReconciliationRecordApi | undefined,
): DiscrepancyAlert['type'] {
  if (!rec) return 'missing_transaction';
  const exp = num(rec.expected_total);
  const act = num(rec.actual_total);
  if (act > exp) return 'overpayment';
  if (act < exp) return 'underpayment';
  return 'missing_transaction';
}

export function mapDiscrepancyAlertApiToUi(
  a: DiscrepancyAlertApi,
): DiscrepancyAlert {
  const rec = a.reconciliationRecord;
  const amount = rec ? num(rec.discrepancy_amount) : 0;
  return {
    id: a.id,
    settlementId: rec?.id ?? a.reconciliationRecordId,
    type: inferAlertType(rec),
    amount,
    description: a.message,
    date: new Date(a.created_at),
    resolved: a.is_resolved,
  };
}

export function mapSummaryApiToUi(
  data: ReconciliationSummaryApiResponse['data'],
): ReconciliationPeriod {
  const disc = num(data.discrepancy_amount);
  const hasDisc =
    data.discrepancy_count > 0 || Math.abs(disc) > 0.000_001;
  return {
    startDate: new Date(data.period_start),
    endDate: new Date(data.period_end),
    totalUSDCReceived: num(data.expected_total),
    totalFiatPayout: num(data.actual_total),
    totalFees: 0,
    transactionCount: data.records?.length ?? data.merchant_count,
    discrepancy: disc,
    status: hasDisc ? 'discrepancy' : 'balanced',
  };
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
