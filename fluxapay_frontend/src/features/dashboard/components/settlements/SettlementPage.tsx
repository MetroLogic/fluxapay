'use client';

import { useState } from 'react';
import { DollarSign, TrendingUp, Clock, Calendar } from 'lucide-react';

import { StatCard } from './StatCard';
import { SettlementFilters } from './SettlementFilters';
import { SettlementsTable } from './SettlementsTable';
import { SettlementDetailsModal } from './SettlementDetailsModal';
import { Settlement } from '../types';

const mockSettlements: Settlement[] = [
    {
        id: 'STL-2024-001',
        date: '2024-01-20',
        paymentsCount: 145,
        usdcAmount: 12500.00,
        fiatAmount: 12500.00,
        currency: 'USD',
        status: 'completed',
        bankReference: 'BNK-REF-001',
        conversionRate: 1.0,
        fees: 125.00,
        payments: [
            { id: 'PAY-001', amount: 150.00, customer: 'John Doe' },
            { id: 'PAY-002', amount: 200.00, customer: 'Jane Smith' },
        ]
    },
    {
        id: 'STL-2024-002',
        date: '2024-01-18',
        paymentsCount: 98,
        usdcAmount: 8750.00,
        fiatAmount: 8750.00,
        currency: 'USD',
        status: 'completed',
        bankReference: 'BNK-REF-002',
        conversionRate: 1.0,
        fees: 87.50,
        payments: []
    },
    {
        id: 'STL-2024-003',
        date: '2024-01-15',
        paymentsCount: 67,
        usdcAmount: 5420.00,
        fiatAmount: 5420.00,
        currency: 'USD',
        status: 'pending',
        bankReference: 'BNK-REF-003',
        conversionRate: 1.0,
        fees: 54.20,
        payments: []
    },
    {
        id: 'STL-2024-004',
        date: '2024-01-12',
        paymentsCount: 203,
        usdcAmount: 18900.00,
        fiatAmount: 18900.00,
        currency: 'USD',
        status: 'completed',
        bankReference: 'BNK-REF-004',
        conversionRate: 1.0,
        fees: 189.00,
        payments: []
    }
];

export default function SettlementsPage() {
    const [status, setStatus] = useState('all');
    const [currency, setCurrency] = useState('all');
    const [date, setDate] = useState({ from: '', to: '' });
    const [selected, setSelected] = useState<Settlement | null>(null);

    const filtered = mockSettlements.filter(s => {
        if (status !== 'all' && s.status !== status) return false;
        if (currency !== 'all' && s.currency !== currency) return false;
        if (date.from && s.date < date.from) return false;
        if (date.to && s.date > date.to) return false;
        return true;
    });

    const totalSettled = mockSettlements
        .filter(s => s.status === 'completed')
        .reduce((sum, s) => sum + s.fiatAmount, 0);

    const totalFees = mockSettlements
        .filter(s => s.status === 'completed')
        .reduce((sum, s) => sum + s.fees, 0);

    return (
        <div className="space-y-6 p-6">
            <header>
                <h2 className="text-2xl font-bold">Settlements</h2>
                <p className="text-muted-foreground">
                    View your settlement history and payouts.
                </p>
            </header>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Settled"
                    value={`$${totalSettled.toLocaleString()}`}
                    icon={DollarSign}
                    trend="+12%"
                />
                <StatCard
                    title="Total Fees"
                    value={`$${totalFees.toLocaleString()}`}
                    icon={TrendingUp}
                />
                <StatCard
                    title="Avg. Settlement Time"
                    value="2.3 days"
                    icon={Clock}
                />
                <StatCard
                    title="Next Settlement"
                    value="Jan 25, 2024"
                    icon={Calendar}
                />
            </div>

            {/* Filters */}
            <SettlementFilters
                status={status}
                currency={currency}
                date={date}
                onStatusChange={setStatus}
                onCurrencyChange={setCurrency}
                onDateChange={setDate}
            />

            {/* Table */}
            <SettlementsTable
                settlements={filtered}
                onSelect={setSelected}
            />

            {/* Modal */}
            {selected && (
                <SettlementDetailsModal
                    settlement={selected}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
