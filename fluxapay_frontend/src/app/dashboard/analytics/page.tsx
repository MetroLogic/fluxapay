'use client';

import { useState, useEffect } from 'react';
import {
    analyticsService,
    RevenueByCountry,
    PaymentDistribution,
    RevenueTrends,
    AnalyticsSummary
} from '@/services/analytics';
import { RevenueByCountryChart } from '@/features/analytics/components/RevenueByCountryChart';
import { PaymentMethodsChart } from '@/features/analytics/components/PaymentMethodsChart';
import { RevenueTrendsChart } from '@/features/analytics/components/RevenueTrendsChart';
import {
    TrendingUp,
    Users,
    CreditCard,
    DollarSign,
    ArrowUpRight,
    Loader2
} from 'lucide-react';

export default function AnalyticsPage() {
    const [loading, setLoading] = useState(true);
    const [revenueByCountry, setRevenueByCountry] = useState<RevenueByCountry[]>([]);
    const [paymentDistribution, setPaymentDistribution] = useState<PaymentDistribution[]>([]);
    const [revenueTrends, setRevenueTrends] = useState<RevenueTrends[]>([]);
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [countries, payments, trends, summ] = await Promise.all([
                    analyticsService.getRevenueByCountry(),
                    analyticsService.getPaymentDistribution(),
                    analyticsService.getRevenueTrends(),
                    analyticsService.getSummary()
                ]);
                setRevenueByCountry(countries);
                setPaymentDistribution(payments);
                setRevenueTrends(trends);
                setSummary(summ);
            } catch (error) {
                console.error('Failed to fetch analytics data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return <AnalyticsSkeleton />;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h2>
                    <p className="text-muted-foreground">Comprehensive insights into your business metrics and growth.</p>
                </div>
            </div>

            {/* Top Cards Summary */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                    title="Total Revenue"
                    value={`$${summary?.totalRevenue.toLocaleString()}`}
                    description="+20.1% from last month"
                    icon={<DollarSign className="h-4 w-4 text-green-500" />}
                />
                <SummaryCard
                    title="Total Payments"
                    value={summary?.totalPayments.toLocaleString() || '0'}
                    description="+15% change"
                    icon={<CreditCard className="h-4 w-4 text-indigo-500" />}
                />
                <SummaryCard
                    title="Active Merchants"
                    value={summary?.activeMerchants.toLocaleString() || '0'}
                    description="+4.5% new merchants"
                    icon={<Users className="h-4 w-4 text-orange-500" />}
                />
                <SummaryCard
                    title="Growth Rate"
                    value={`${summary?.growthRate}%`}
                    description="Performance trend"
                    icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                {/* Revenue Trends Chart - Large */}
                <div className="col-span-full lg:col-span-4 rounded-xl border bg-card p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-semibold">Revenue Trends</h3>
                            <p className="text-sm text-muted-foreground">Daily revenue performance over the last 7 days.</p>
                        </div>
                        <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <RevenueTrendsChart data={revenueTrends} />
                </div>

                {/* Payment Methods Distribution */}
                <div className="col-span-full lg:col-span-3 rounded-xl border bg-card p-6 shadow-sm">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold">Payment Methods</h3>
                        <p className="text-sm text-muted-foreground">Distribution across payment gateways.</p>
                    </div>
                    <PaymentMethodsChart data={paymentDistribution} />
                </div>
            </div>

            <div className="grid gap-6 col-span-full">
                {/* Revenue By Country */}
                <div className="rounded-xl border bg-card p-6 shadow-sm">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold">Revenue By Country</h3>
                        <p className="text-sm text-muted-foreground">Geographic performance comparison.</p>
                    </div>
                    <RevenueByCountryChart data={revenueByCountry} />
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ title, value, description, icon }: { title: string, value: string, description: string, icon: React.ReactNode }) {
    return (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <span className="text-sm font-medium">{title}</span>
                {icon}
            </div>
            <div>
                <div className="text-2xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
        </div>
    );
}

function AnalyticsSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-20 w-1/3 bg-slate-200 rounded-md mb-8"></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 bg-slate-100 rounded-xl border"></div>
                ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4 h-[400px] bg-slate-100 rounded-xl border flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                </div>
                <div className="col-span-3 h-[400px] bg-slate-100 rounded-xl border flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                </div>
            </div>
            <div className="h-[400px] bg-slate-100 rounded-xl border"></div>
        </div>
    );
}
