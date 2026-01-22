import { DashboardShell } from "@/features/dashboard/layout/DashboardShell";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Dashboard | Fluxapay",
    description: "Merchant Dashboard",
};

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardShell>{children}</DashboardShell>;
}
