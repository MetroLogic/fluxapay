"use client";

import React, { useState, useMemo } from 'react';
import { subDays, startOfDay } from 'date-fns';
import { ReconciliationRecord } from '../../../types/reconciliation';
import { ReconciliationSummary } from '../../../components/reconciliation/ReconciliationSummary';
import { ReconciliationTable } from '../../../components/reconciliation/ReconciliationTable';
import { StatementDownload } from '../../../components/reconciliation/StatementDownload';
import { DiscrepancyAlert } from '../../../components/reconciliation/DiscrepancyAlert';
import { useReconciliation } from '../../../hooks/useReconciliation';
import { exportToPDF, exportToCSV } from '../../../utils/exportHelpers';

export default function ReconciliationPage() {
    const [dateRangeFilter, setDateRangeFilter] = useState<'today' | '7days' | '30days'>('30days');

    // Compute date range based on filter, memoized to prevent infinite loops
    const { startDate, endDate } = useMemo(() => {
        const end = new Date();
        let start = new Date();

        if (dateRangeFilter === 'today') {
            start = startOfDay(end);
        } else if (dateRangeFilter === '7days') {
            start = startOfDay(subDays(end, 7));
        } else if (dateRangeFilter === '30days') {
            start = startOfDay(subDays(end, 30));
        }

        return { startDate: start, endDate: end };
    }, [dateRangeFilter]);

    const { records, summary, discrepancies, loading, error, setDiscrepancies } = useReconciliation({
        start: startDate,
        end: endDate
    });

    const handleDownloadPDF = async () => {
        if (!summary) return;
        await exportToPDF(
            records,
            summary,
            { name: 'Demo Merchant', id: 'MERCH-10293' }
        );
    };

    const handleDownloadCSV = () => {
        exportToCSV(records);
    };

    const handleResolveAlert = (id: string) => {
        setDiscrepancies(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    };

    const handleDownloadRecord = async (record: ReconciliationRecord) => {
        // Helper to download single record
        if (!summary) return;
        const singleSummary = {
            ...summary,
            totalUSDCReceived: record.usdcReceived,
            totalFiatPayout: record.fiatPayout,
            totalFees: record.fees,
            discrepancy: record.discrepancy,
            transactionCount: 1,
            startDate: record.date,
            endDate: record.date
        };
        await exportToPDF([record], singleSummary, { name: 'Demo Merchant', id: 'MERCH-10293' });
    };

    if (error) {
        return (
            <div className="p-8 max-w-7xl mx-auto">
                <div className="bg-red-50 border border-red-200 p-4 rounded-md text-red-800">
                    <h2 className="font-bold text-lg mb-2">Error Loading Reconciliation Data</h2>
                    <p>{error.message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Reconciliation & Statements</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Track USDC received versus Fiat payouts and identify any discrepancies.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <select
                            value={dateRangeFilter}
                            onChange={(e) => setDateRangeFilter(e.target.value as 'today' | '7days' | '30days')}
                            className="w-full sm:w-auto block rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border shadow-sm bg-white"
                        >
                            <option value="today">Today</option>
                            <option value="7days">Last 7 days</option>
                            <option value="30days">Last 30 days</option>
                        </select>

                        <StatementDownload
                            onDownloadPDF={handleDownloadPDF}
                            onDownloadCSV={handleDownloadCSV}
                            disabled={loading || records.length === 0}
                        />
                    </div>
                </div>

                {/* Alerts Section */}
                <DiscrepancyAlert
                    alerts={discrepancies}
                    onResolve={handleResolveAlert}
                />

                {/* Summary Card Grid */}
                <ReconciliationSummary
                    summary={summary}
                    loading={loading}
                />

                {/* Detailed Table Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-medium text-gray-900">Settlement Records</h2>
                    </div>

                    <ReconciliationTable
                        records={records}
                        loading={loading}
                        onDownloadRecord={handleDownloadRecord}
                    />
                </div>

            </div>
        </div>
    );
}
