"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export type ActivityItem = {
  id: string;
  type: "payment" | "settlement" | "alert";
  title: string;
  amount?: string;
  status?: "success" | "failed" | "pending";
  date: string;
  user?: string;
  rawDate: string;
};

interface BackendPayment {
  id: string;
  amount: number;
  status: string;
  customer: string;
  created_at: string;
}

interface BackendSettlement {
  id: string;
  amount: number;
  status: string;
  settled_at: string;
}

interface BackendAlert {
  id: string;
  reason: string;
  created_at: string;
}

interface DashboardActivityResponse {
  message: string;
  data: {
    recent_payments?: BackendPayment[];
    recent_settlements?: BackendSettlement[];
    failed_alerts?: BackendAlert[];
  };
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n / 100); // backend may send cents
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today) {
    return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function mapResponseToActivities(data: DashboardActivityResponse["data"]): ActivityItem[] {
  const items: ActivityItem[] = [];
  const mapStatus = (s: string): "success" | "failed" | "pending" => {
    const u = (s || "").toUpperCase();
    if (u === "SUCCESS" || u === "COMPLETED") return "success";
    if (u === "FAILED") return "failed";
    return "pending";
  };

  (data.recent_payments ?? []).forEach((p) => {
    items.push({
      id: p.id,
      type: "payment",
      title: `Payment from ${p.customer || "Customer"}`,
      amount: `+${formatAmount(p.amount)}`,
      status: mapStatus(p.status),
      date: formatDate(p.created_at),
      user: p.customer,
      rawDate: p.created_at,
    });
  });

  (data.recent_settlements ?? []).forEach((s) => {
    items.push({
      id: s.id,
      type: "settlement",
      title: "Settlement",
      amount: `-${formatAmount(s.amount)}`,
      status: mapStatus(s.status),
      date: formatDate(s.settled_at),
      user: "System",
      rawDate: s.settled_at,
    });
  });

  (data.failed_alerts ?? []).forEach((a) => {
    items.push({
      id: a.id,
      type: "alert",
      title: "Failed Payment",
      amount: undefined,
      status: "failed",
      date: formatDate(a.created_at),
      user: a.reason,
      rawDate: a.created_at,
    });
  });

  items.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
  return items.slice(0, 10);
}

export function useDashboardActivity(params: { from?: string; to?: string } = {}) {
  const key =
    params.from || params.to
      ? ["dashboard-activity", params.from, params.to]
      : "dashboard-activity";

  const { data, error, isLoading, mutate } = useSWR<DashboardActivityResponse>(
    key,
    () => api.dashboard.activity({ from: params.from, to: params.to }) as Promise<DashboardActivityResponse>
  );

  const activities = data?.data ? mapResponseToActivities(data.data) : [];

  return {
    activities,
    error,
    isLoading,
    mutate,
  };
}
