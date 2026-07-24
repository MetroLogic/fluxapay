"use client";

import useSWR from "swr";
import { useState, useCallback, useMemo } from "react";
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
  read?: boolean;
}

interface UseDashboardNotificationsOptions {
  webhookLimit?: number;
  payoutLimit?: number;
  categoryFilter?: NotificationCategory | "all";
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

const READ_KEY = "dashboard-notifications-read";

function getReadIds(): Set<string> {
  try {
    const stored = localStorage.getItem(READ_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markAsRead(id: string) {
  const readIds = getReadIds();
  readIds.add(id);
  localStorage.setItem(READ_KEY, JSON.stringify([...readIds]));
}

function markAllAsRead(ids: string[]) {
  const readIds = getReadIds();
  ids.forEach(id => readIds.add(id));
  localStorage.setItem(READ_KEY, JSON.stringify([...readIds]));
}

export function useDashboardNotifications(
  options: UseDashboardNotificationsOptions = {},
) {
  const webhookLimit = options.webhookLimit ?? 10;
  const payoutLimit = options.payoutLimit ?? 10;
  const categoryFilter = options.categoryFilter ?? "all";

  const [readVersion, setReadVersion] = useState(0);

  const key = ["dashboard-notifications", webhookLimit, payoutLimit, readVersion];

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

      const readIds = getReadIds();

      const webhookNotifications: DashboardNotification[] = webhookLogs.map(
        (log) => ({
          id: `webhook-${log.id}`,
          category: "webhook_failure",
          severity: "critical",
          title: "Webhook delivery failed",
          description: `${log.event_type ?? "Event"} to ${log.endpoint_url ?? "endpoint"}`,
          timestamp: toIso(log.updated_at ?? log.created_at),
          href: "/dashboard/webhooks",
          read: readIds.has(`webhook-${log.id}`),
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
          const notifId = `payout-${row.id}`;

          return {
            id: notifId,
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
            read: readIds.has(notifId),
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

  const filteredNotifications = useMemo(() => {
    if (categoryFilter === "all") return notifications;
    return notifications.filter(n => n.category === categoryFilter);
  }, [notifications, categoryFilter]);

  const unreadCount = notifications.filter(
    (item) => !item.read && (item.severity === "critical" || item.severity === "warning"),
  ).length;

  const handleMarkAsRead = useCallback((id: string) => {
    markAsRead(id);
    setReadVersion(v => v + 1);
    mutate();
  }, [mutate]);

  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead(notifications.map(n => n.id));
    setReadVersion(v => v + 1);
    mutate();
  }, [notifications, mutate]);

  return {
    notifications: filteredNotifications,
    allNotifications: notifications,
    unreadCount,
    isLoading,
    error,
    refresh: mutate,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
  };
}
