import { DashboardShell } from "@/features/dashboard/layout/DashboardShell";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Merchant Dashboard | FluxaPay",
  description:
    "Manage your payments, analytics, settlements, and more from your FluxaPay merchant dashboard.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
