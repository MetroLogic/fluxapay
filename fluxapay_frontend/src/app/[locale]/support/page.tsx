import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Support - FluxaPay Help Center",
    description: "Access FluxaPay support resources, knowledge base, and help documentation for payment integration.",
    slug: "/support",
    keywords: ["support", "help", "knowledge base", "troubleshooting", "assistance"],
    locale,
  });
}

export default function LocalizedSupportPage() {
  return <StaticInfoPage {...STATIC_PAGES.support} />;
}
