"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, AlertTriangle, Clock3, CheckCircle2, ChevronRight, CheckCheck, Filter } from "lucide-react";
import { useDashboardNotifications, DashboardNotification } from "@/hooks/useDashboardNotifications";
import { cn } from "@/lib/utils";

interface NotificationsCenterProps {
  compact?: boolean;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function SeverityIcon({ severity }: { severity: "critical" | "warning" | "info" }) {
  if (severity === "critical") {
    return <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden="true" />;
  }
  if (severity === "warning") {
    return <Clock3 className="h-4 w-4 text-amber-500" aria-hidden="true" />;
  }
  return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />;
}

function CategoryBadge({ category }: { category: DashboardNotification["category"] }) {
  const styles = {
    webhook_failure: "bg-red-100 text-red-700",
    payout: "bg-blue-100 text-blue-700",
  };
  const labels = {
    webhook_failure: "Webhook",
    payout: "Payout",
  };
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", styles[category])}>
      {labels[category]}
    </span>
  );
}

export function NotificationsCenter({ compact = false }: NotificationsCenterProps) {
  const [categoryFilter, setCategoryFilter] = useState<"all" | "webhook_failure" | "payout">("all");
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
  } = useDashboardNotifications({
    webhookLimit: compact ? 5 : 20,
    payoutLimit: compact ? 5 : 20,
    categoryFilter,
  });

  const visible = compact ? notifications.slice(0, 6) : notifications;
  const showFilterControls = !compact;

  return (
    <section
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm",
        compact ? "h-full" : "",
      )}
      aria-label="Notifications center"
    >
      <div className="flex items-center justify-between p-6 pb-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <Bell className="h-4 w-4" />
            Notifications Center
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Webhook failures and payout updates in one feed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && showFilterControls && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
          {unreadCount > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {unreadCount} unread
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              All clear
            </span>
          )}
        </div>
      </div>

      {showFilterControls && (
        <div className="px-6 pb-2">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="flex gap-1">
              {(["all", "webhook_failure", "payout"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setCategoryFilter(filter)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full transition-colors",
                    categoryFilter === filter
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {filter === "all" ? "All" : filter === "webhook_failure" ? "Webhooks" : "Payouts"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="p-6 pt-4">
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            Failed to load notifications. Please try again.
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="animate-pulse rounded-lg border p-3">
                <div className="mb-2 h-4 w-36 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-emerald-100 p-3 mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-foreground">No notifications</p>
            <p className="text-xs text-muted-foreground mt-1">
              {categoryFilter === "all"
                ? "You're all caught up! No webhook failures or payout updates."
                : `No ${categoryFilter === "webhook_failure" ? "webhook" : "payout"} notifications found.`}
            </p>
          </div>
        )}

        {!isLoading && !error && visible.length > 0 && (
          <ul className="space-y-3">
            {visible.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => !item.read && markAsRead(item.id)}
                  className={cn(
                    "group block rounded-lg border p-3 transition-colors hover:bg-muted/40",
                    !item.read && "bg-blue-50/50 border-blue-200"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityIcon severity={item.severity} />
                        <p className="text-sm font-medium">
                          {item.title}
                        </p>
                        {!item.read && (
                          <span className="h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <CategoryBadge category={item.category} />
                        <p className="mt-0 break-words text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatTimestamp(item.timestamp)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
