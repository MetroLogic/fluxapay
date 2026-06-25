"use client";

import Link from "next/link";
import { Bell, AlertTriangle, Clock3, CheckCircle2, ChevronRight } from "lucide-react";
import { useDashboardNotifications } from "@/hooks/useDashboardNotifications";
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

export function NotificationsCenter({ compact = false }: NotificationsCenterProps) {
  const { notifications, isLoading, error, unreadCount } = useDashboardNotifications({
    webhookLimit: compact ? 5 : 20,
    payoutLimit: compact ? 5 : 20,
  });

  const visible = compact ? notifications.slice(0, 6) : notifications;

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
        {unreadCount > 0 ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            {unreadCount} active
          </span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            All clear
          </span>
        )}
      </div>

      <div className="p-6 pt-4">
        {error && (
          <p className="text-sm text-destructive">
            Failed to load notifications.
          </p>
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
          <p className="text-sm text-muted-foreground">No recent notifications.</p>
        )}

        {!isLoading && !error && visible.length > 0 && (
          <ul className="space-y-3">
            {visible.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group block rounded-lg border p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <SeverityIcon severity={item.severity} />
                        {item.title}
                      </p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {item.description}
                      </p>
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
