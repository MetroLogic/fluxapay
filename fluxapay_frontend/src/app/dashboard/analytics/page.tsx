'use client';

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
} from 'lucide-react';

function EmptyChart({ label }: { label: string }) {
    return (
        <div className="h-[300px] w-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <BarChart2 className="h-10 w-10 opacity-30" />
            <p className="text-sm">No {label} data for this period</p>
        </div>
    );
}

function AnalyticsSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-10 w-1/3 bg-slate-200 rounded-md" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 bg-slate-100 rounded-xl border" />
                ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4 h-[380px] bg-slate-100 rounded-xl border flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                </div>
                <div className="col-span-3 h-[380px] bg-slate-100 rounded-xl border flex items-center justify-center">
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
                <DateRangePicker />
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
