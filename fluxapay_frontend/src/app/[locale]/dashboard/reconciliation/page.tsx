"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { subDays, startOfDay } from 'date-fns';
import { Loader2, AlertCircle } from 'lucide-react';
import { ReconciliationRecord } from '@/types/reconciliation';
import { ReconciliationSummary } from '@/components/reconciliation/ReconciliationSummary';
import { ReconciliationTable } from '@/components/reconciliation/ReconciliationTable';
import { StatementDownload } from '@/components/reconciliation/StatementDownload';
import { DiscrepancyAlert } from '@/components/reconciliation/DiscrepancyAlert';
import { useReconciliation } from '@/hooks/useReconciliation';
import { exportSettlementReportPDF, exportToPDF } from '@/utils/exportHelpers';
import { api, ApiError } from '@/lib/api';

type AssetFilter = 'all' | 'USDC' | 'XLM';

export default function ReconciliationPage() {
    const [dateRangeFilter, setDateRangeFilter] = useState<'today' | '7days' | '30days'>('30days');
    const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');
    const [minDiscrepancy, setMinDiscrepancy] = useState('');
    const [exportLoading, setExportLoading] = useState<'pdf' | 'csv' | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [merchant, setMerchant] = useState<{ name: string; id: string }>({ name: '', id: '' });

    useEffect(() => {
        api.merchant.getMe().then((res) => {
            const m = (res as { merchant?: { id?: string; business_name?: string } }).merchant;
            if (m?.id) setMerchant({ id: m.id, name: m.business_name ?? '' });
        }).catch(() => {});
    }, []);

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

    const { records, summary, discrepancies, loading, error, resolveDiscrepancy } = useReconciliation({
        start: startDate,
        end: endDate
    });

    const exportParams = useMemo(() => ({
        date_from: format(startDate, 'yyyy-MM-dd'),
        date_to: format(endDate, 'yyyy-MM-dd'),
        asset: assetFilter !== 'all' ? assetFilter : undefined,
        min_discrepancy: minDiscrepancy ? parseFloat(minDiscrepancy) : undefined,
    }), [startDate, endDate, assetFilter, minDiscrepancy]);

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const handleDownloadPDF = async () => {
        setExportError(null);
        setExportLoading('pdf');
        try {
            const result = await api.settlements.exportRange({
                ...exportParams,
                format: 'pdf',
            });
            const pdfResult = result as { content: Parameters<typeof exportSettlementReportPDF>[0] };
            exportSettlementReportPDF(
                pdfResult.content,
                `reconciliation-${exportParams.date_from}-${exportParams.date_to}.pdf`,
            );
        } catch (e) {
            const message = e instanceof ApiError ? e.message : 'Failed to export PDF from server';
            setExportError(message);
        } finally {
            setExportLoading(null);
        }
    };

    const handleDownloadCSV = async () => {
        setExportError(null);
        setExportLoading('csv');
        try {
            const blob = (await api.settlements.exportRange({
                ...exportParams,
                format: 'csv',
            })) as Blob;
            downloadBlob(blob, `reconciliation-${exportParams.date_from}-${exportParams.date_to}.csv`);
        } catch (e) {
            const message = e instanceof ApiError ? e.message : 'Failed to export CSV from server';
            setExportError(message);
        } finally {
            setExportLoading(null);
        }
    };

    const handleResolveAlert = async (id: string) => {
        try {
            await resolveDiscrepancy(id);
        } catch (e) {
            const message = e instanceof ApiError ? e.message : 'Could not resolve alert';
            window.alert(message);
        }
    };

    const handleDownloadRecord = async (record: ReconciliationRecord) => {
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
        try {
            await exportToPDF([record], singleSummary, { name: merchant.name || 'Merchant', id: merchant.id });
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to export record';
            setExportError(message);
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

                {exportError && (
                    <div
                        className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
                        role="alert"
                    >
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold">Export failed</p>
                            <p className="text-sm mt-1">{exportError}</p>
                            <button
                                type="button"
                                onClick={() => setExportError(null)}
                                className="text-sm underline mt-2"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

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

                        <select
                            value={assetFilter}
                            onChange={(e) => setAssetFilter(e.target.value as AssetFilter)}
                            className="w-full sm:w-auto block rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border shadow-sm bg-white"
                            aria-label="Filter by asset"
                        >
                            <option value="all">All assets</option>
                            <option value="USDC">USDC</option>
                            <option value="XLM">XLM</option>
                        </select>

                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Min discrepancy"
                            value={minDiscrepancy}
                            onChange={(e) => setMinDiscrepancy(e.target.value)}
                            className="w-full sm:w-36 block rounded-md border-gray-300 py-2 px-3 text-sm border shadow-sm bg-white"
                            aria-label="Minimum discrepancy filter"
                        />

                        <StatementDownload
                            onDownloadPDF={handleDownloadPDF}
                            onDownloadCSV={handleDownloadCSV}
                            disabled={loading || exportLoading !== null}
                            isExporting={exportLoading}
                        />
                    </div>
                </div>

                <DiscrepancyAlert
                    alerts={discrepancies}
                    onResolve={handleResolveAlert}
                />

                <ReconciliationSummary
                    summary={summary}
                    loading={loading}
                />

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-medium text-gray-900">Settlement Records</h2>
                        {exportLoading && (
                            <span className="inline-flex items-center gap-2 text-sm text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Exporting {exportLoading.toUpperCase()}…
                            </span>
                        )}
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
