"use client";

import {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { useDashboardStats } from "@/hooks/useDashboardStats";

const COLORS = ["#10b981", "#ef4444", "#f59e0b", "#3b82f6"];

const ChartCard = ({
    title,
    children,
    className,
}: {
    title: string;
    children: React.ReactNode;
    className?: string;
}) => {
    return (
        <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm p-6", className)}>
            <h3 className="text-lg font-semibold leading-none tracking-tight mb-4">{title}</h3>
            <div className="h-[300px] w-full">{children}</div>
        </div>
    );
};

export const ChartsSection = () => {
    const { stats, isLoading, error } = useDashboardStats();

    const volumeData = stats?.volumeByDay ?? [
        { name: "Mon", value: 0 },
        { name: "Tue", value: 0 },
        { name: "Wed", value: 0 },
        { name: "Thu", value: 0 },
        { name: "Fri", value: 0 },
        { name: "Sat", value: 0 },
        { name: "Sun", value: 0 },
    ];
    const revenueData = stats?.revenueByWeek ?? [
        { name: "Week 1", revenue: 0 },
        { name: "Week 2", revenue: 0 },
        { name: "Week 3", revenue: 0 },
        { name: "Week 4", revenue: 0 },
    ];
    const statusData = stats?.statusDistribution ?? [
        { name: "Successful", value: 0, color: "var(--color-chart-1)" },
        { name: "Failed", value: 0, color: "var(--color-destructive)" },
        { name: "Pending", value: 0, color: "var(--color-chart-2)" },
    ];

    if (error) {
        return (
            <div className="rounded-xl border bg-card p-6 mt-4 text-destructive">
                Failed to load charts. Please try again.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-xl border bg-card p-6 h-[300px] animate-pulse lg:col-span-4" />
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
            {/* Payment Volume - Line Chart */}
            <ChartCard title="Payment Volume (Last 7 Days)" className="lg:col-span-4">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={volumeData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                        <XAxis
                            dataKey="name"
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `$${value}`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--color-card)",
                                borderColor: "var(--color-border)",
                                borderRadius: "8px",
                            }}
                            itemStyle={{ color: "var(--color-foreground)" }}
                        />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke="var(--color-primary)" // Primary color
                            strokeWidth={2}
                            activeDot={{ r: 8 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* Revenue Trend - Bar Chart */}
            <ChartCard title="Monthly Revenue Trend" className="lg:col-span-3">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                        <XAxis
                            dataKey="name"
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#888888"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `$${value}`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--color-card)",
                                borderColor: "var(--color-border)",
                                borderRadius: "8px",
                            }}
                            cursor={{ fill: "var(--color-muted)" }}
                            itemStyle={{ color: "var(--color-foreground)" }}
                        />
                        <Bar dataKey="revenue" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* Payment Status - Pie Chart */}
            <ChartCard title="Payment Status Distribution" className="lg:col-span-3">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {statusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--color-card)",
                                borderColor: "var(--color-border)",
                                borderRadius: "8px",
                            }}
                            itemStyle={{ color: "var(--color-foreground)" }}
                        />
                        <Legend layout="horizontal" verticalAlign="bottom" align="center" />
                    </PieChart>
                </ResponsiveContainer>
            </ChartCard>
        </div>
    );
};
