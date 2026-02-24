import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function LocalizedStatusPage() {
  return <StaticInfoPage {...STATIC_PAGES.status} />;
}
