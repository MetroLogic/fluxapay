'use client';

import { useState } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useDashboardAnalytics } from '@/hooks/useDashboardAnalytics';
import {
    alignSeries,
    averageTicket,
    formatDelta,
    getPreviousPeriod,
    percentChange,
} from '@/lib/analyticsComparison';
import { RevenueComparisonChart } from './RevenueComparisonChart';

interface Props {
    from: string;
    to: string;
    current: {
        summary: { totalRevenue: number; totalPayments: number };
        revenueTrends: Array<{ date: string; revenue: number }>;
    };
}

function DeltaBadge({ label, pct }: { label: string; pct: number | null }) {
    const up = pct !== null && pct > 0;
    const down = pct !== null && pct < 0;
    const color = up ? 'text-green-700 bg-green-50' : down ? 'text-red-700 bg-red-50' : 'text-slate-600 bg-slate-100';
    const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
    return (
        <div className="rounded-lg border p-3" data-testid={`delta-${label}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                <Icon className="h-3 w-3" aria-hidden="true" />
                {formatDelta(pct)}
            </span>
        </div>
    );
}

function ComparisonBody({ from, to, current }: Props) {
    const prevRange = getPreviousPeriod({ from, to });
    const prev = useDashboardAnalytics(prevRange);
    if (prev.isLoading) return <p className="text-sm text-muted-foreground">Loading comparison...</p>;
    if (prev.error) return <p className="text-sm text-destructive">Failed to load previous period.</p>;

    const cur = current.summary;
    const data = alignSeries(current.revenueTrends, prev.revenueTrends);
    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                Comparing {from} to {to} with {prevRange.from} to {prevRange.to}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
                <DeltaBadge label="Total Volume" pct={percentChange(cur.totalRevenue, prev.summary.totalRevenue)} />
                <DeltaBadge label="Payment Count" pct={percentChange(cur.totalPayments, prev.summary.totalPayments)} />
                <DeltaBadge
                    label="Average Ticket Size"
                    pct={percentChange(
                        averageTicket(cur.totalRevenue, cur.totalPayments),
                        averageTicket(prev.summary.totalRevenue, prev.summary.totalPayments),
                    )}
                />
            </div>
            <RevenueComparisonChart data={data} />
        </div>
    );
}

export function RevenueComparisonSection(props: Props) {
    const [enabled, setEnabled] = useState(false);
    return (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Period Comparison</h3>
                <label className="inline-flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                    />
                    Compare to previous period
                </label>
            </div>
            {enabled && <ComparisonBody {...props} />}
        </div>
    );
}
