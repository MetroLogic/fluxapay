// Client-side store for dashboard notifications published by the browser itself.
//
// `useDashboardNotifications` derives its feed from the API (webhook failures
// and payouts). Some events never exist as an API row — a finished bulk export,
// for example — so they are published here, persisted so they survive a reload,
// and merged into the same feed by the hook.

export type LocalNotificationCategory = "export";
export type LocalNotificationSeverity = "info" | "warning" | "critical";

export interface LocalDashboardNotification {
  id: string;
  category: LocalNotificationCategory;
  severity: LocalNotificationSeverity;
  title: string;
  description: string;
  timestamp: string;
  href: string;
}

export type NewLocalDashboardNotification = Omit<
  LocalDashboardNotification,
  "id" | "timestamp"
> & {
  id?: string;
  timestamp?: string;
};

const STORAGE_KEY = "fluxapay-dashboard-notifications";
const EVENT_NAME = "fluxapay:dashboard-notification";
/** Keep the persisted list bounded so it cannot grow without limit. */
const MAX_STORED = 25;

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof localStorage !== "undefined"
  );
}

function newNotificationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Read the locally published notifications, newest first. */
export function readLocalDashboardNotifications(): LocalDashboardNotification[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed as LocalDashboardNotification[])
      : [];
  } catch {
    return [];
  }
}

/**
 * Publish a notification to the dashboard feed.
 *
 * Persists it for later visits and fires an event so mounted consumers update
 * without waiting for the next SWR revalidation.
 */
export function publishLocalDashboardNotification(
  input: NewLocalDashboardNotification,
): LocalDashboardNotification {
  const notification: LocalDashboardNotification = {
    id: input.id ?? newNotificationId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    category: input.category,
    severity: input.severity,
    title: input.title,
    description: input.description,
    href: input.href,
  };

  if (!isBrowser()) return notification;

  try {
    const next = [notification, ...readLocalDashboardNotifications()].slice(
      0,
      MAX_STORED,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked. The event below still surfaces the
    // notification for the current session, which is better than losing it.
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: notification }));
  return notification;
}

/** Subscribe to newly published notifications. Returns an unsubscribe function. */
export function subscribeToLocalDashboardNotifications(
  listener: () => void,
): () => void {
  if (!isBrowser()) return () => {};
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
