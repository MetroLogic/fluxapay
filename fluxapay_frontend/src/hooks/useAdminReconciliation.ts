import { useState, useEffect, useCallback } from 'react';
import {
  ReconciliationRecord,
  ReconciliationPeriod,
  DiscrepancyAlert,
  mapReconciliationRecordApiToUi,
  mapDiscrepancyAlertApiToUi,
  mapSummaryApiToUi,
  type ReconciliationSummaryApiResponse,
  type DiscrepancyAlertsApiResponse,
} from '../types/reconciliation';
import { api, ApiError } from '../lib/api';

const ALERTS_PAGE_SIZE = 100;

export function useAdminReconciliation(dateRange: { start: Date; end: Date }, merchantId?: string) {
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [summary, setSummary] = useState<ReconciliationPeriod | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const startTime = dateRange.start.getTime();
  const endTime = dateRange.end.getTime();

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const periodStart = new Date(startTime).toISOString();
      const periodEnd = new Date(endTime).toISOString();

      try {
        const [summaryRes, alertsRes] = await Promise.all([
          api.reconciliation.summary({
            merchant_id: merchantId,
            period_start: periodStart,
            period_end: periodEnd,
          }) as Promise<ReconciliationSummaryApiResponse>,
          api.reconciliation.listAlerts({
            merchant_id: merchantId,
            is_resolved: false,
            page: 1,
            limit: ALERTS_PAGE_SIZE,
          }) as Promise<DiscrepancyAlertsApiResponse>,
        ]);

        if (!isMounted) return;

        const data = summaryRes.data;
        setSummary(mapSummaryApiToUi(data));
        setRecords(
          (data.records ?? []).map((r) => mapReconciliationRecordApiToUi(r)),
        );
        setDiscrepancies(
          (alertsRes.data?.alerts ?? []).map((a) =>
            mapDiscrepancyAlertApiToUi(a),
          ),
        );
      } catch (err) {
        if (!isMounted) return;
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load reconciliation data';
        setError(new Error(msg));
        setRecords([]);
        setSummary(null);
        setDiscrepancies([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchData();

    return () => {
      isMounted = false;
    };
  }, [startTime, endTime, merchantId]);

  const resolveDiscrepancy = useCallback(async (alertId: string) => {
    await api.reconciliation.resolveAlert(alertId, true);
    setDiscrepancies((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, resolved: true } : a)),
    );
  }, []);

  return {
    records,
    summary,
    discrepancies,
    loading,
    error,
    resolveDiscrepancy,
  };
}
