"use client";

export function NotificationsTab() {
  return (
    <div className="space-y-4 p-6 rounded-2xl border bg-muted/20">
      <div className="flex items-center gap-2 text-primary font-semibold mb-4">
        <h3 className="text-lg">Notification Preferences</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure how you receive payment notifications, settlement alerts, and
        account updates.
      </p>
      <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
        Notification preferences coming soon. Currently, you will receive email
        notifications for payment confirmations and settlement completions.
      </div>
    </div>
  );
}
