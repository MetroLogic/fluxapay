import type { Metadata } from "next";
import { SettingsPage } from "@/features/settings";

export const metadata: Metadata = {
  title: "Settings | FluxaPay Dashboard",
  description: "Manage your profile, API keys, webhooks, and notification preferences.",
  robots: { index: false, follow: false },
};

export default function Settings() {
    return <SettingsPage />;
}
