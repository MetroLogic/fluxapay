"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/Badge";
import { Button, buttonVariants } from "@/components/Button";
import { MOCK_PAYMENTS } from "@/features/admin/payments/mock-data";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Activity,
  CreditCard,
  DollarSign,
  Users,
  UserPlus,
  Clock,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Local type for mixed feed
type ActivityItem =
  | { type: "payment"; data: (typeof MOCK_PAYMENTS)[0] }
  | { type: "signup"; id: string; merchantName: string; createdAt: string };

export default function AdminOverviewPage() {
  // 1. Calculate Metrics
  const totalVolume = MOCK_PAYMENTS.reduce((sum, p) => sum + p.amount, 0);
  const totalMerchants = 124;
  const activeMerchants = 89;
  const totalFees = totalVolume * 0.01;
  const pendingSettlements = 14;

  // 2. Prepare Mixed Activity Feed
  const signups: ActivityItem[] = [
    {
      type: "signup",
      id: "mer_new_001",
      merchantName: "Cafe Nero",
      createdAt: "2025-10-24T09:45:00Z",
    },
    {
      type: "signup",
      id: "mer_new_002",
      merchantName: "Digital Arts LLC",
      createdAt: "2025-10-23T14:15:00Z",
    },
  ];

  const paymentActivities: ActivityItem[] = MOCK_PAYMENTS.map((p) => ({
    type: "payment",
    data: p,
  }));

  const recentActivity = [...paymentActivities, ...signups]
    .sort(
      (a, b) =>
        new Date(
          b.type === "payment" ? b.data.createdAt : b.createdAt,
        ).getTime() -
        new Date(
          a.type === "payment" ? a.data.createdAt : a.createdAt,
        ).getTime(),
    )
    .slice(0, 5);

  const statusCounts = MOCK_PAYMENTS.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // 3. Prepare Chart Data
  const volumeData = [
    { name: "Day 1", volume: 6500 },
    { name: "Day 2", volume: 4500 },
    { name: "Day 3", volume: 7800 },
    { name: "Day 4", volume: 5200 },
    { name: "Day 5", volume: 9000 },
    { name: "Day 6", volume: 8500 },
    { name: "Day 7", volume: 10000 },
  ];

  const statusChartData = [
    {
      name: "Completed",
      value: statusCounts["completed"] || 0,
      color: "#22c55e",
    }, // green-500
    {
      name: "Processing",
      value: statusCounts["processing"] || 0,
      color: "#eab308",
    }, // yellow-500
    { name: "Failed", value: statusCounts["failed"] || 0, color: "#ef4444" }, // red-500
  ].filter((d) => d.value > 0);

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Dashboard Overview
        </h1>
        <div className="flex gap-2">
          <Button variant="outline">Download Report</Button>
        </div>
      </div>

      {/* Metrics Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalVolume.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Merchants
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMerchants}</div>
            <p className="text-xs text-muted-foreground">+12 new this week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active (7d)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeMerchants}</div>
            <p className="text-xs text-muted-foreground">71% engagement rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Fees Collected
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalFees.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">+4% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Settlements
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingSettlements}</div>
            <p className="text-xs text-muted-foreground">
              Requires manual review
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Charts Section: Volume Over Time */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Volume Over Time</CardTitle>
            <CardDescription>
              Transaction volume for the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[200px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData}>
                  <defs>
                    <linearGradient
                      id="colorVolume"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--muted-foreground)/0.2)"
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 12,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    dy={10}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 12,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={(value) => `$${value / 1000}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--card-foreground))",
                    }}
                    formatter={(value: number | string | undefined) => [
                      `$${Number(value || 0).toLocaleString()}`,
                      "Volume",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorVolume)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Charts Section: Payment Status Distribution */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
            <CardDescription>Distribution of recent payments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity Feed */}
        <Card className="col-span-7">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest transactions and events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((item) => (
                <div
                  key={item.type === "payment" ? item.data.id : item.id}
                  className="flex items-center justify-between p-2 border-b last:border-0 hover:bg-muted/50 rounded-sm px-2 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {item.type === "payment"
                        ? item.data.merchantName
                        : item.merchantName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.type === "payment"
                        ? item.data.id
                        : `New Merchant Signup`}
                    </span>
                  </div>
                  {item.type === "payment" ? (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-bold text-sm">
                          {item.data.currency} {item.data.amount.toFixed(2)}
                        </div>
                        {/* THE FIX: Fixed locale prevents hydration errors */}
                        <div className="text-xs text-muted-foreground">
                          {new Date(item.data.createdAt).toLocaleDateString("en-US")}
                        </div>
                      </div>
                      <Badge
                        variant={
                          item.data.status === "completed"
                            ? "success"
                            : item.data.status === "failed"
                              ? "destructive"
                              : "default"
                        }
                        className="capitalize w-20 justify-center"
                      >
                        {item.data.status}
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        {/* THE FIX: Fixed locale prevents hydration errors */}
                        <div className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString("en-US")}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="w-20 justify-center gap-1"
                      >
                        <UserPlus className="h-3 w-3" />
                        New
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
              <Link
                href="/admin/payments"
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "w-full text-xs",
                )}
              >
                View All Activity
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}