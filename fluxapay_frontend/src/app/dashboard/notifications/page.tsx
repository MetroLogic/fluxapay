import type { Metadata } from "next";
import { NotificationsCenter } from "@/features/dashboard/components/overview/NotificationsCenter";

export const metadata: Metadata = {
  title: "Notifications | FluxaPay Dashboard",
  description: "Monitor webhook failures and payout updates in one dashboard feed.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
        <p className="text-muted-foreground">
          Track webhook failures and payout lifecycle updates.
        </p>
      </div>
      <NotificationsCenter />
    </div>
  );
}
