import { Metadata } from "next";
import { DashboardOverview } from "@/features/dashboard/components/DashboardOverview";

export const metadata: Metadata = {
  title: "Dashboard Overview | FluxaPay",
  description:
    "View your business overview, key metrics, and recent transactions.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardPage() {
  return <DashboardOverview />;
}
