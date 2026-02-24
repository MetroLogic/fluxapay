import { useState, useEffect } from 'react';
import { ReconciliationRecord, ReconciliationPeriod, DiscrepancyAlert } from '../types/reconciliation';
import { addHours } from 'date-fns';

const generateMockData = (start: Date, end: Date) => {
    const records: ReconciliationRecord[] = [];
    const alerts: DiscrepancyAlert[] = [];
    let currentDate = new Date(start);

    let idCounter = 1;
    while (currentDate <= end) {
        const isDiscrepancy = Math.random() > 0.9; // 10% chance
        const usdc = Math.random() * 5000 + 100;
        const fees = usdc * 0.01;
        let fiat = usdc - fees;
        let discrepancy = 0;

        if (isDiscrepancy) {
            discrepancy = (Math.random() * 50) * (Math.random() > 0.5 ? 1 : -1);
            fiat = fiat + discrepancy;

            alerts.push({
                id: `alt-${idCounter}`,
                settlementId: `SET-${idCounter.toString().padStart(6, '0')}`,
                type: discrepancy > 0 ? 'overpayment' : 'underpayment',
                amount: Math.abs(discrepancy),
                description: `Mismatch between USDC received and Fiat payout for settlement SET-${idCounter.toString().padStart(6, '0')}.`,
                date: new Date(currentDate),
                resolved: false,
            });
        }

        const calculatedDiscrepancy = usdc - (fiat + fees);

        records.push({
            id: `rec-${idCounter}`,
            settlementId: `SET-${idCounter.toString().padStart(6, '0')}`,
            date: new Date(currentDate),
            usdcReceived: usdc,
            fiatPayout: fiat,
            fees: fees,
            discrepancy: calculatedDiscrepancy,
        });

        currentDate = addHours(currentDate, 14);
        idCounter++;
    }

    return { records: records.reverse(), alerts: alerts.reverse() };
};

export function useReconciliation(dateRange: { start: Date; end: Date }) {
    const [records, setRecords] = useState<ReconciliationRecord[]>([]);
    const [summary, setSummary] = useState<ReconciliationPeriod | null>(null);
    const [discrepancies, setDiscrepancies] = useState<DiscrepancyAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Extract primitive timestamps so the effect dep array can be statically analysed
    const startTime = dateRange.start.getTime();
    const endTime = dateRange.end.getTime();

    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                await new Promise(resolve => setTimeout(resolve, 800));

                const { records: mockRecords, alerts: mockAlerts } = generateMockData(
                    new Date(startTime),
                    new Date(endTime)
                );

                if (!isMounted) return;

                let totalUSDC = 0;
                let totalFiat = 0;
                let totalFees = 0;
                let totalDiscrepancy = 0;

                mockRecords.forEach(r => {
                    totalUSDC += r.usdcReceived;
                    totalFiat += r.fiatPayout;
                    totalFees += r.fees;
                    totalDiscrepancy += r.discrepancy;
                });

                const calcSummary: ReconciliationPeriod = {
                    startDate: new Date(startTime),
                    endDate: new Date(endTime),
                    totalUSDCReceived: totalUSDC,
                    totalFiatPayout: totalFiat,
                    totalFees: totalFees,
                    transactionCount: mockRecords.length,
                    discrepancy: totalDiscrepancy,
                    status: Math.abs(totalDiscrepancy) > 0.01 ? 'discrepancy' : 'balanced'
                };

                setRecords(mockRecords);
                setSummary(calcSummary);
                setDiscrepancies(mockAlerts);

            } catch (err) {
                if (isMounted) setError(err as Error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();

        return () => { isMounted = false; };
    }, [startTime, endTime]);

    return { records, summary, discrepancies, loading, error, setDiscrepancies };
}
