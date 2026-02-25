import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function LocalizedApiReferencePage() {
  return <StaticInfoPage {...STATIC_PAGES["docs/api-reference"]} />;
}
