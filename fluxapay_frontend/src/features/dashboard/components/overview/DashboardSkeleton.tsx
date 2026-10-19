import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for the 6-card stats row */
const StatsCardsSkeleton = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Highlighted "Total Volume" card — spans 2 cols on xl and has an FxRateBadge below */}
        <div className="md:col-span-2 lg:col-span-1 xl:col-span-2 flex flex-col gap-2">
            <div className="rounded-xl border bg-card p-6 flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-8 w-40 mb-2" />
                <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex justify-end">
                <Skeleton className="h-6 w-20" />
            </div>
        </div>

        {/* Remaining 5 stat cards */}
        {Array.from({ length: 5 }).map((_, i) => (
            <div
                key={i}
                className="rounded-xl border bg-card p-6 md:col-span-2 lg:col-span-1 xl:col-span-1"
            >
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
            </div>
        ))}
    </div>
);

/** Skeleton for the three chart panels */
const ChartsSectionSkeleton = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
        {/* Line chart — lg:col-span-4 */}
        <div className="rounded-xl border bg-card p-6 lg:col-span-4">
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="h-[260px] flex flex-col justify-between">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
            </div>
        </div>

        {/* Bar chart — lg:col-span-3 */}
        <div className="rounded-xl border bg-card p-6 lg:col-span-3">
            <Skeleton className="h-6 w-40 mb-4" />
            <div className="h-[260px] flex flex-col justify-between">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
            </div>
        </div>

        {/* Pie chart — lg:col-span-3 */}
        <div className="rounded-xl border bg-card p-6 lg:col-span-3">
            <Skeleton className="h-6 w-40 mb-4" />
            <div className="flex items-center justify-center h-[260px]">
                <Skeleton className="w-32 h-32 rounded-full" />
            </div>
        </div>
    </div>
);

/** Skeleton for the Recent Activity panel */
const RecentActivitySkeleton = () => (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm col-span-1 lg:col-span-4 h-full">
        <div className="p-6 pb-0">
            <Skeleton className="h-5 w-36 mb-2" />
            <Skeleton className="h-3 w-56" />
        </div>
        <div className="p-6 pt-4 space-y-6">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                        </div>
                    </div>
                    <Skeleton className="h-4 w-16" />
                </div>
            ))}
        </div>
    </div>
);

/**
 * Full-page skeleton for the dashboard overview.
 * Mirrors the layout of DashboardOverview so there is no layout shift
 * when real content replaces the skeleton.
 */
export const DashboardSkeleton = () => (
    <div className="space-y-4">
        {/* Header row: title + date range picker */}
        <div className="flex flex-wrap items-center justify-between gap-4">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-10 w-48" />
        </div>

        <StatsCardsSkeleton />
        <ChartsSectionSkeleton />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
            <RecentActivitySkeleton />

            {/* Notifications panel placeholder */}
            <div className="col-span-1 lg:col-span-3 rounded-xl border bg-card p-6">
                <Skeleton className="h-5 w-32 mb-4" />
                <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex gap-3">
                            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                            <div className="space-y-1 flex-1">
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick actions placeholder */}
            <div className="col-span-1 lg:col-span-5 rounded-xl border bg-card p-6">
                <Skeleton className="h-5 w-32 mb-4" />
                <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 rounded-xl" />
                    ))}
                </div>
            </div>
        </div>
    </div>
);
