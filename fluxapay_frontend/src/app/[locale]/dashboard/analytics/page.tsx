'use client';

import { useCallback, useState } from 'react';
import { RevenueByCountryChart } from '@/features/analytics/components/RevenueByCountryChart';
import { PaymentMethodsChart } from '@/features/analytics/components/PaymentMethodsChart';
import { RevenueTrendsChart } from '@/features/analytics/components/RevenueTrendsChart';
import { useDashboardAnalytics } from '@/hooks/useDashboardAnalytics';
import { useDashboardDateRange, DashboardDateRangeProvider } from '@/features/dashboard/context/DashboardDateRangeContext';
import { DateRangePicker } from '@/features/dashboard/components/overview/DateRangePicker';
import {
    TrendingUp,
    Users,
    CreditCard,
    DollarSign,
    ArrowUpRight,
    Loader2,
    AlertCircle,
    BarChart2,
    Download,
    Check,
} from 'lucide-react';

function EmptyChart({ label }: { label: string }) {
    // Matches the rendered chart height so swapping between them shifts nothing.
    return (
        <div
            data-testid="empty-chart"
            role="status"
            className="h-[300px] w-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
        >
            <BarChart2 className="h-10 w-10 opacity-30" />
            <p className="text-sm">No {label} data for this period</p>
        </div>
    );
}

/**
 * Loading placeholder for the analytics dashboard.
 *
 * Every wrapper here mirrors the loaded layout's grid and column spans exactly
 * — same `space-y-6`, same `md:grid-cols-2 lg:grid-cols-7`, same
 * `col-span-full lg:col-span-4` / `lg:col-span-3`. That is the whole point: a
 * skeleton whose boxes land anywhere other than where the real charts land
 * causes the layout shift it was added to prevent. The previous version used
 * bare `col-span-4` / `col-span-3`, which collapsed differently from the real
 * layout at the `md` breakpoint.
 */
function AnalyticsSkeleton() {
    return (
        <div className="space-y-6 animate-pulse" data-testid="analytics-skeleton" aria-hidden="true">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-2">
                    <div className="h-9 w-72 bg-slate-200 rounded-md" />
                    <div className="h-5 w-96 max-w-full bg-slate-100 rounded-md" />
                </div>
                <div className="flex items-center gap-3">
                    <div className="h-10 w-32 bg-slate-100 rounded-lg border" />
                    <div className="h-10 w-56 bg-slate-100 rounded-lg border" />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 bg-slate-100 rounded-xl border" />
                ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-full lg:col-span-4 h-[380px] bg-slate-100 rounded-xl border flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                </div>
                <div className="col-span-full lg:col-span-3 h-[380px] bg-slate-100 rounded-xl border flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                </div>
            </div>

            <div className="h-[380px] bg-slate-100 rounded-xl border" />
        </div>
    );
}

function SummaryCard({ title, value, description, icon }: {
    title: string;
    value: string;
    description: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-row items-center justify-between pb-2">
                <span className="text-sm font-medium text-muted-foreground">{title}</span>
                {icon}
            </div>
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
    );
}

function ExportCsvButton({ data }: { data: { summary: ReturnType<typeof useDashboardAnalytics>['summary']; revenueTrends: ReturnType<typeof useDashboardAnalytics>['revenueTrends']; paymentDistribution: ReturnType<typeof useDashboardAnalytics>['paymentDistribution']; revenueByCountry: ReturnType<typeof useDashboardAnalytics>['revenueByCountry'] } }) {
    const [exported, setExported] = useState(false);

    const handleExport = useCallback(() => {
        const rows: string[] = [];
        rows.push('Date,Revenue,Target');
        data.revenueTrends.forEach(r => {
            rows.push(`${r.date},${r.revenue},${r.target ?? ''}`);
        });
        rows.push('');
        rows.push('Method,Distribution %');
        data.paymentDistribution.forEach(p => {
            rows.push(`${p.method},${p.value}`);
        });
        rows.push('');
        rows.push('Country,Revenue');
        data.revenueByCountry.forEach(c => {
            rows.push(`${c.country},${c.revenue}`);
        });
        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setExported(true);
        setTimeout(() => setExported(false), 2000);
    }, [data]);

    return (
        <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
            aria-label="Export analytics data as CSV"
        >
            {exported ? <Check className="h-4 w-4 text-green-600" /> : <Download className="h-4 w-4" />}
            {exported ? 'Exported' : 'Export CSV'}
        </button>
    );
}

function AnalyticsContent() {
    const { dateRange } = useDashboardDateRange();
    const { summary, revenueTrends, paymentDistribution, revenueByCountry, isLoading, error } =
        useDashboardAnalytics({ from: dateRange.from, to: dateRange.to });

    if (isLoading) return <AnalyticsSkeleton />;

    if (error) {
        return (
            <div className="rounded-xl border bg-card p-8 flex flex-col items-center gap-3 text-destructive">
                <AlertCircle className="h-8 w-8" />
                <p className="font-medium">Failed to load analytics data. Please try again.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h2>
                    <p className="text-muted-foreground">Comprehensive insights into your business metrics and growth.</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportCsvButton data={{ summary, revenueTrends, paymentDistribution, revenueByCountry }} />
                    <DateRangePicker />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                    title="Total Revenue"
                    value={`$${summary.totalRevenue.toLocaleString()}`}
                    description="Settled in selected period"
                    icon={<DollarSign className="h-4 w-4 text-green-500" />}
                />
                <SummaryCard
                    title="Total Payments"
                    value={summary.totalPayments.toLocaleString()}
                    description="Transactions in selected period"
                    icon={<CreditCard className="h-4 w-4 text-indigo-500" />}
                />
                <SummaryCard
                    title="Active Merchants"
                    value={summary.activeMerchants.toLocaleString()}
                    description="Currently active accounts"
                    icon={<Users className="h-4 w-4 text-orange-500" />}
                />
                <SummaryCard
                    title="Growth Rate"
                    value={`${summary.growthRate}%`}
                    description="Period-over-period performance"
                    icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                {/* Revenue Trends */}
                <div className="col-span-full lg:col-span-4 rounded-xl border bg-card p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-semibold">Revenue Trends</h3>
                            <p className="text-sm text-muted-foreground">Daily revenue over the selected period.</p>
                        </div>
                        <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                    {revenueTrends.length === 0
                        ? <EmptyChart label="revenue trend" />
                        : <RevenueTrendsChart data={revenueTrends} />}
                </div>

                {/* Payment Distribution */}
                <div className="col-span-full lg:col-span-3 rounded-xl border bg-card p-6 shadow-sm">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold">Payment Methods</h3>
                        <p className="text-sm text-muted-foreground">Distribution across payment gateways.</p>
                    </div>
                    {paymentDistribution.length === 0
                        ? <EmptyChart label="payment distribution" />
                        : <PaymentMethodsChart data={paymentDistribution} />}
                </div>
            </div>

            {/* Revenue by Country */}
            <div className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold">Revenue By Country</h3>
                    <p className="text-sm text-muted-foreground">Geographic performance comparison.</p>
                </div>
                {revenueByCountry.length === 0
                    ? <EmptyChart label="country revenue" />
                    : <RevenueByCountryChart data={revenueByCountry} />}
            </div>
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <DashboardDateRangeProvider>
            <AnalyticsContent />
        </DashboardDateRangeProvider>
    );
}
