"use client";

import { useMemo } from "react";
import { useSettlementSummary } from "@/hooks/useSettlements";
import { useSettlements } from "@/hooks/useSettlements";

export interface DashboardStats {
  totalRevenue: number;
  totalPayments: number;
  pendingPayments: number;
  successRate: number;
  avgTransaction: number;
  totalSettled: number;
  volumeByDay: { name: string; value: number }[];
  revenueByWeek: { name: string; revenue: number }[];
  statusDistribution: { name: string; value: number; color: string }[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function useDashboardStats() {
  const { summary, isLoading: summaryLoading, error: summaryError, mutate: mutateSummary } = useSettlementSummary();
  const { settlements, isLoading: listLoading, error: listError, mutate: mutateList } = useSettlements({
    limit: 100,
  });

  const stats = useMemo((): DashboardStats | null => {
    if (summaryError || listError) return null;
    const totalSettled = Number(summary?.total_settled_this_month ?? 0);
    const totalFees = Number(summary?.total_fees_paid ?? 0);
    const completed = settlements.filter((s) => s.status === "completed");
    const pending = settlements.filter((s) => s.status === "pending");
    const failed = settlements.filter((s) => s.status === "failed");
    const totalPayments = settlements.length;
    const successRate =
      totalPayments > 0 ? Math.round((completed.length / totalPayments) * 1000) / 10 : 0;
    const sumAmount = completed.reduce((acc, s) => acc + s.fiatAmount, 0);
    const avgTransaction = totalPayments > 0 ? sumAmount / totalPayments : 0;

    const volumeByDayMap = new Map<string, number>();
    DAY_NAMES.forEach((d) => volumeByDayMap.set(d, 0));
    for (const s of settlements) {
      if (!s.date) continue;
      const day = new Date(s.date).getDay();
      const name = DAY_NAMES[day];
      volumeByDayMap.set(name, (volumeByDayMap.get(name) ?? 0) + s.fiatAmount);
    }
    const volumeByDay = DAY_NAMES.map((name) => ({
      name,
      value: volumeByDayMap.get(name) ?? 0,
    }));

    const now = new Date();
    const revenueByWeek: { name: string; revenue: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date(now);
      start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const weekSum = completed
        .filter((s) => {
          const d = new Date(s.date).getTime();
          return d >= start.getTime() && d < end.getTime();
        })
        .reduce((acc, s) => acc + s.fiatAmount, 0);
      revenueByWeek.push({ name: `Week ${4 - i}`, revenue: weekSum });
    }

    const statusDistribution = [
      { name: "Successful", value: completed.length, color: "var(--color-chart-1)" },
      { name: "Failed", value: failed.length, color: "var(--color-destructive)" },
      { name: "Pending", value: pending.length, color: "var(--color-chart-2)" },
    ].filter((d) => d.value > 0);
    const defaultStatus = [
      { name: "Successful", value: 0, color: "var(--color-chart-1)" },
      { name: "Failed", value: 0, color: "var(--color-destructive)" },
      { name: "Pending", value: 0, color: "var(--color-chart-2)" },
    ];

    return {
      totalRevenue: totalSettled,
      totalPayments,
      pendingPayments: pending.length,
      successRate,
      avgTransaction,
      totalSettled,
      volumeByDay,
      revenueByWeek,
      statusDistribution: statusDistribution.length ? statusDistribution : defaultStatus,
    };
  }, [summary, settlements, summaryError, listError]);

  const mutate = () => {
    void mutateSummary();
    void mutateList();
  };

  return {
    stats: stats ?? undefined,
    error: summaryError ?? listError,
    isLoading: summaryLoading || listLoading,
    mutate,
  };
}
