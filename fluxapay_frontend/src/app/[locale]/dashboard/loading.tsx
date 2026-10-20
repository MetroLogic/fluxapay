import { DashboardSkeleton } from "@/features/dashboard/components/overview/DashboardSkeleton";

/**
 * Next.js route-level loading UI for the dashboard overview page.
 * Displayed automatically while the page component suspends on first load.
 * Using DashboardSkeleton ensures the skeleton matches the real layout
 * exactly, preventing layout shift when content arrives.
 */
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
