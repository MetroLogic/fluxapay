import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function RateLimitsPage() {
  return <StaticInfoPage {...STATIC_PAGES["docs/rate-limits"]} />;
}
