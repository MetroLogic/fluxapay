import { StatsCards } from "./overview/StatsCards";
import { ChartsSection } from "./overview/ChartsSection";
import { RecentActivity } from "./overview/RecentActivity";
import { QuickActions } from "./overview/QuickActions";

export const DashboardOverview = () => {
    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
                <div className="flex items-center space-x-2">
                    {/* DateRangePicker or similar could go here */}
                </div>
            </div>

            <StatsCards />

            <ChartsSection />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <RecentActivity />
                <QuickActions />
            </div>
        </div>
    );
};
