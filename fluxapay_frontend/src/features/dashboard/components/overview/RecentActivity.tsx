"use client";

import { ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardDateRange } from "@/features/dashboard/context/DashboardDateRangeContext";
import { useDashboardActivity, type ActivityItem } from "@/hooks/useDashboardActivity";

type ActivityType = "payment" | "settlement" | "alert";
type Status = "success" | "failed" | "pending";

const StatusIcon = ({ status }: { status?: Status }) => {
    if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
    if (status === "pending") return <Clock className="h-4 w-4 text-yellow-500" />;
    return null;
};

const ActivityIcon = ({ type }: { type: ActivityType }) => {
    if (type === "payment") return <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"><ArrowUpRight className="h-5 w-5 text-blue-600 dark:text-blue-300" /></div>;
    if (type === "settlement") return <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center"><ArrowDownLeft className="h-5 w-5 text-purple-600 dark:text-purple-300" /></div>;
    if (type === "alert") return <div className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-300" /></div>;
    return null;
};

export const RecentActivity = () => {
    const { dateRange } = useDashboardDateRange();
    const { activities, isLoading, error } = useDashboardActivity({
        from: dateRange.from,
        to: dateRange.to,
    });

    if (error) {
        return (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm col-span-1 lg:col-span-4 p-6 text-destructive">
                Failed to load recent activity.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm col-span-1 lg:col-span-4 h-full">
                <div className="p-6 pb-0">
                    <h3 className="text-lg font-semibold leading-none tracking-tight">Recent Activity</h3>
                    <p className="text-sm text-muted-foreground mt-1">Your last 10 transactions and alerts.</p>
                </div>
                <div className="p-6 pt-4 space-y-6">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center justify-between animate-pulse">
                            <div className="flex items-center gap-4">
                                <div className="h-9 w-9 rounded-full bg-muted" />
                                <div className="space-y-1">
                                    <div className="h-4 w-32 bg-muted rounded" />
                                    <div className="h-3 w-24 bg-muted rounded" />
                                </div>
                            </div>
                            <div className="h-4 w-16 bg-muted rounded" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm col-span-1 lg:col-span-4 h-full">
            <div className="p-6 pb-0">
                <h3 className="text-lg font-semibold leading-none tracking-tight">Recent Activity</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Your last 10 transactions and alerts in the selected date range.
                </p>
            </div>
            <div className="p-6 pt-4">
                <div className="space-y-6">
                    {activities.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No activity in this date range.</p>
                    ) : (
                        activities.map((item: ActivityItem) => (
                            <div key={item.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <ActivityIcon type={item.type} />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium leading-none">{item.title}</p>
                                        <p className="text-xs text-muted-foreground">{item.date}{item.user ? ` • ${item.user}` : ""}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        {item.amount != null && (
                                            <p className={cn("text-sm font-medium", item.type === "settlement" ? "text-foreground" : item.status === "failed" ? "text-destructive" : "text-green-600")}>
                                                {item.amount}
                                            </p>
                                        )}
                                        {item.status != null && <p className="text-xs text-muted-foreground capitalize text-right">{item.status}</p>}
                                    </div>
                                    <StatusIcon status={item.status} />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
