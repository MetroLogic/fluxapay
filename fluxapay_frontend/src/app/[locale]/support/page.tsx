import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function LocalizedSupportPage() {
  return <StaticInfoPage {...STATIC_PAGES.support} />;
}
