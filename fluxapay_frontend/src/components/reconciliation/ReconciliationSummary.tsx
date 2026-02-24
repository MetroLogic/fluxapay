import React from 'react';
import { ReconciliationPeriod } from '../../types/reconciliation';

interface Props {
    summary: ReconciliationPeriod | null;
    loading: boolean;
}

const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

export function ReconciliationSummary({ summary, loading }: Props) {
    if (loading || !summary) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                        <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                    </div>
                ))}
            </div>
        );
    }

    const isBalanced = Math.abs(summary.discrepancy) <= 0.01;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* USDC Received */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center text-gray-500 mb-2">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium uppercase tracking-wider">USDC Received</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summary.totalUSDCReceived, 'USD').replace('$', '')} <span className="text-lg font-normal text-gray-500">USDC</span>
                </div>
            </div>

            {/* Fiat Payout */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center text-gray-500 mb-2">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <span className="text-sm font-medium uppercase tracking-wider">Fiat Payout</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summary.totalFiatPayout)}
                </div>
            </div>

            {/* Fees */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center text-gray-500 mb-2">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-sm font-medium uppercase tracking-wider">Total Fees</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summary.totalFees)}
                </div>
            </div>

            {/* Discrepancy */}
            <div className={`p-6 rounded-xl shadow-sm border ${isBalanced ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-200'}`}>
                <div className={`flex items-center mb-2 ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-sm font-medium uppercase tracking-wider">Net Discrepancy</span>
                </div>
                <div className={`text-2xl font-bold ${isBalanced ? 'text-green-800' : 'text-red-800'}`}>
                    {formatCurrency(summary.discrepancy)}
                </div>
                {!isBalanced && (
                    <div className="mt-2 text-sm text-red-600 font-medium">Action Required</div>
                )}
            </div>
        </div>
    );
}
