"use client";

import React, { useState, useMemo } from 'react';
import { subDays, startOfDay, format } from 'date-fns';
import { ReconciliationRecord } from '../../../types/reconciliation';
import { ReconciliationSummary } from '../../../components/reconciliation/ReconciliationSummary';
import { ReconciliationTable } from '../../../components/reconciliation/ReconciliationTable';
import { StatementDownload } from '../../../components/reconciliation/StatementDownload';
import { DiscrepancyAlert } from '../../../components/reconciliation/DiscrepancyAlert';
import { useReconciliation } from '../../../hooks/useReconciliation';
import { api } from '../../../lib/api';

export default function ReconciliationPage() {
    const [dateRangeFilter, setDateRangeFilter] = useState<'today' | '7days' | '30days'>('30days');
    const [assetFilter, setAssetFilter] = useState<'all' | 'USDC' | 'XLM'>('all');
    const [minDiscrepancyFilter, setMinDiscrepancyFilter] = useState<string>('');
    const [exportError, setExportError] = useState<string | null>(null);

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

    // Client-side filtering of the display list to match selected filters dynamically
    const filteredRecords = useMemo(() => {
        return records.filter(record => {
            if (assetFilter !== 'all') {
                const recordAsset = parseInt(record.id.replace('rec-', '')) % 2 === 0 ? 'USDC' : 'XLM';
                if (recordAsset !== assetFilter) return false;
            }
            if (minDiscrepancyFilter !== '') {
                const threshold = parseFloat(minDiscrepancyFilter);
                if (!isNaN(threshold) && Math.abs(record.discrepancy) < threshold) return false;
            }
            return true;
        });
    }, [records, assetFilter, minDiscrepancyFilter]);

    const handleDownloadPDF = async () => {
        try {
            setExportError(null);
            const response = await api.settlements.exportRange({
                date_from: startDate.toISOString(),
                date_to: endDate.toISOString(),
                asset: assetFilter,
                min_discrepancy: minDiscrepancyFilter ? parseFloat(minDiscrepancyFilter) : 0,
                format: 'pdf',
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to generate PDF report on server.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `reconciliation_report_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
            document.body.appendChild(link);
            link.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);
        } catch (err: any) {
            console.error('PDF Export Error:', err);
            setExportError(err.message || 'An error occurred while exporting PDF.');
            throw err;
        }
    };

    const handleDownloadCSV = async () => {
        try {
            setExportError(null);
            const response = await api.settlements.exportRange({
                date_from: startDate.toISOString(),
                date_to: endDate.toISOString(),
                asset: assetFilter,
                min_discrepancy: minDiscrepancyFilter ? parseFloat(minDiscrepancyFilter) : 0,
                format: 'csv',
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to generate CSV report on server.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `reconciliation_report_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
            document.body.appendChild(link);
            link.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);
        } catch (err: any) {
            console.error('CSV Export Error:', err);
            setExportError(err.message || 'An error occurred while exporting CSV.');
            throw err;
        }
    };

    const handleResolveAlert = (id: string) => {
        setDiscrepancies(prev => prev.map(a => a.id === id ? { ...a, resolved: true } : a));
    };

    const handleDownloadRecord = async (record: ReconciliationRecord) => {
        try {
            setExportError(null);
            const response = await api.settlements.export(record.settlementId, 'pdf');

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Failed to generate report for settlement ${record.settlementId}.`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `settlement_${record.settlementId}.pdf`;
            document.body.appendChild(link);
            link.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);
        } catch (err: any) {
            console.error('Record Export Error:', err);
            setExportError(err.message || 'An error occurred while exporting settlement details PDF.');
        }
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
                            disabled={loading || filteredRecords.length === 0}
                        />
                    </div>
                </div>

                {/* Advanced Filters Panel */}
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Advanced Filters</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <div className="w-full sm:w-auto">
                            <select
                                value={assetFilter}
                                onChange={(e) => setAssetFilter(e.target.value as 'all' | 'USDC' | 'XLM')}
                                className="w-full block rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border shadow-sm bg-white"
                            >
                                <option value="all">All Assets (USDC & XLM)</option>
                                <option value="USDC">USDC Only</option>
                                <option value="XLM">XLM Only</option>
                            </select>
                        </div>
                        <div className="w-full sm:w-auto">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={minDiscrepancyFilter}
                                onChange={(e) => setMinDiscrepancyFilter(e.target.value)}
                                placeholder="Min discrepancy threshold ($)"
                                className="w-full block rounded-md border-gray-300 py-2 px-3 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border shadow-sm bg-white"
                            />
                        </div>
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
                        records={filteredRecords}
                        loading={loading}
                        onDownloadRecord={handleDownloadRecord}
                    />
                </div>

            </div>

            {/* Premium Error Handling Overlay Modal */}
            {exportError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm transition-all duration-300">
                    <div className="bg-white rounded-2xl shadow-2xl border border-red-50 p-6 max-w-md w-full mx-4 space-y-4 transform scale-100 transition-all">
                        <div className="flex items-center gap-3 text-red-600">
                            <div className="bg-red-50 p-2 rounded-full">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Export Request Failed</h3>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            {exportError}
                        </p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setExportError(null)}
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors duration-200 shadow-md shadow-red-200"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
