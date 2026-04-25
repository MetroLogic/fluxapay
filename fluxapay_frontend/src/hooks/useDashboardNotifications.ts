"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

type NotificationCategory = "webhook_failure" | "payout";
type NotificationSeverity = "critical" | "warning" | "info";

export interface DashboardNotification {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  description: string;
  timestamp: string;
  href: string;
}

interface UseDashboardNotificationsOptions {
  webhookLimit?: number;
  payoutLimit?: number;
}

interface WebhookLogRow {
  id: string;
  event_type?: string;
  endpoint_url?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

interface SettlementRow {
  id: string;
  amount?: unknown;
  currency?: string;
  status?: string;
  created_at?: string;
}

function toIso(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  return new Date(0).toISOString();
}

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function useDashboardNotifications(
  options: UseDashboardNotificationsOptions = {},
) {
  const webhookLimit = options.webhookLimit ?? 10;
  const payoutLimit = options.payoutLimit ?? 10;

  const key = ["dashboard-notifications", webhookLimit, payoutLimit];

  const { data, error, isLoading, mutate } = useSWR<DashboardNotification[]>(
    key,
    async () => {
      const [webhookRes, settlementRes] = await Promise.all([
        api.webhooks.logs({ status: "failed", page: 1, limit: webhookLimit }) as Promise<{
          data?: { logs?: WebhookLogRow[] };
        }>,
        api.settlements.list({ page: 1, limit: payoutLimit }) as Promise<{
          settlements?: SettlementRow[];
          data?: { settlements?: SettlementRow[] };
        }>,
      ]);

      const webhookLogs = webhookRes?.data?.logs ?? [];
      const settlements =
        settlementRes?.settlements ?? settlementRes?.data?.settlements ?? [];

      const webhookNotifications: DashboardNotification[] = webhookLogs.map(
        (log) => ({
          id: `webhook-${log.id}`,
          category: "webhook_failure",
          severity: "critical",
          title: "Webhook delivery failed",
          description: `${log.event_type ?? "Event"} to ${log.endpoint_url ?? "endpoint"}`,
          timestamp: toIso(log.updated_at ?? log.created_at),
          href: "/dashboard/webhooks",
        }),
      );

      const payoutNotifications: DashboardNotification[] = settlements
        .filter((row) =>
          ["completed", "pending", "failed"].includes(
            String(row.status ?? "").toLowerCase(),
          ),
        )
        .map((row) => {
          const status = String(row.status ?? "pending").toLowerCase();
          const amount = toNumber(row.amount);
          const currency = row.currency ?? "USD";

          return {
            id: `payout-${row.id}`,
            category: "payout",
            severity:
              status === "failed"
                ? "critical"
                : status === "pending"
                  ? "warning"
                  : "info",
            title:
              status === "failed"
                ? "Payout failed"
                : status === "pending"
                  ? "Payout pending"
                  : "Payout completed",
            description: `${amount.toLocaleString()} ${currency} • Settlement ${row.id}`,
            timestamp: toIso(row.created_at),
            href: "/dashboard/settlements",
          } as DashboardNotification;
        });

      return [...webhookNotifications, ...payoutNotifications].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    },
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
    },
  );

  const notifications = data ?? [];
  const unreadCount = notifications.filter(
    (item) => item.severity === "critical" || item.severity === "warning",
  ).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh: mutate,
  };
}
