"use client";

import { ArrowUpRight, ArrowDownRight, DollarSign, Activity, CreditCard, Clock, Percent, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardDateRange } from "@/features/dashboard/context/DashboardDateRangeContext";
import { useDashboardStats } from "@/hooks/useDashboardStats";

interface StatCardProps {
    title: string;
    value: string;
    change?: string;
    trend?: "up" | "down" | "neutral";
    icon: React.ElementType;
    description?: string;
    className?: string;
    highlight?: boolean;
}

const StatCard = ({ title, value, change, trend, icon: Icon, description, className, highlight }: StatCardProps) => {
    return (
        <div className={cn(
            "rounded-xl border bg-card text-card-foreground shadow-sm p-6",
            highlight && "border-primary/30 bg-primary/5",
            className
        )}>
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{title}</h3>
                <Icon className={cn("h-4 w-4", highlight ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
                <div className={cn("text-2xl font-bold", highlight && "text-primary")}>{value}</div>
                {(change || description) && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        {change && (
                            <span
                                className={cn(
                                    "flex items-center font-medium",
                                    trend === "up" && "text-green-500",
                                    trend === "down" && "text-red-500",
                                    trend === "neutral" && "text-muted-foreground"
                                )}
                            >
                                {trend === "up" && <ArrowUpRight className="h-3 w-3 mr-0.5" />}
                                {trend === "down" && <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                                {change}
                            </span>
                        )}
                        {description && <span className="opacity-80">{description}</span>}
                    </p>
                )}
            </div>
        </div>
    );
};

function formatCurrency(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function formatUsdc(n: number) {
    return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} USDC`;
}

export const StatsCards = () => {
    const { dateRange } = useDashboardDateRange();
    const { stats, isLoading, error } = useDashboardStats({
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
    });

    if (error) {
        return (
            <div className="rounded-xl border bg-card p-6 text-destructive">
                Failed to load dashboard stats. Please try again.
            </div>
        );
    }

    if (isLoading || !stats) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="rounded-xl border bg-card p-6 animate-pulse">
                        <div className="h-4 w-24 bg-muted rounded mb-2" />
                        <div className="h-8 w-32 bg-muted rounded" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* USDC Volume — highlighted as primary metric */}
            <StatCard
                title="Total Volume (USDC)"
                value={formatUsdc(stats.totalRevenue)}
                change={`${stats.totalPayments} payments`}
                trend="up"
                icon={Coins}
                highlight
                className="md:col-span-2 lg:col-span-1 xl:col-span-2"
            />
            {/* Fiat settled */}
            <StatCard
                title="Total Settled (Fiat)"
                value={formatCurrency(stats.totalSettled)}
                description="Converted & settled"
                trend="up"
                icon={DollarSign}
                className="md:col-span-2 lg:col-span-1 xl:col-span-2"
            />
            <StatCard
                title="Total Payments"
                value={stats.totalPayments.toLocaleString()}
                trend="up"
                icon={CreditCard}
            />
            <StatCard
                title="Pending"
                value={String(stats.pendingPayments)}
                trend={stats.pendingPayments > 0 ? "neutral" : "down"}
                icon={Clock}
            />
            <StatCard
                title="Success Rate"
                value={`${stats.successRate}%`}
                trend="up"
                icon={Percent}
            />
            <StatCard
                title="Avg. Transaction"
                value={formatCurrency(stats.avgTransaction)}
                trend="up"
                icon={Activity}
            />
        </div>
    );
};
