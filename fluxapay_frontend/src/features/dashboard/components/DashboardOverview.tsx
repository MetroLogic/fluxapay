"use client";

import { DashboardDateRangeProvider } from "@/features/dashboard/context/DashboardDateRangeContext";
import { StatsCards } from "./overview/StatsCards";
import { ChartsSection } from "./overview/ChartsSection";
import { RecentActivity } from "./overview/RecentActivity";
import { QuickActions } from "./overview/QuickActions";
import { DateRangePicker } from "./overview/DateRangePicker";

function OverviewContent() {
    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
                <DateRangePicker />
            </div>

            <StatsCards />
            <ChartsSection />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <RecentActivity />
                <QuickActions />
            </div>
        </div>
    );
}

export const DashboardOverview = () => {
    return (
        <DashboardDateRangeProvider>
            <OverviewContent />
        </DashboardDateRangeProvider>
    );
};
