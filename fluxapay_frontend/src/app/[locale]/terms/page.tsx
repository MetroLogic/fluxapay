import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Terms and Conditions - FluxaPay",
    description: "Read FluxaPay's terms and conditions for using our payment infrastructure platform.",
    slug: "/terms",
    keywords: ["terms", "conditions", "legal", "agreement"],
    locale,
  });
}

export default function LocalizedTermsPage() {
  return <StaticInfoPage {...STATIC_PAGES.terms} />;
}
