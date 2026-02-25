import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function LocalizedCommunityPage() {
  return <StaticInfoPage {...STATIC_PAGES.community} />;
}
