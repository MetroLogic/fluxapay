import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Rate Limits - FluxaPay API Documentation",
    description: "Learn about FluxaPay API rate limits, quota management, and best practices for handling rate limit responses.",
    slug: "/docs/rate-limits",
    keywords: ["rate limits", "quota", "API limits", "throttling", "best practices"],
    locale,
  });
}

export default function LocalizedRateLimitsPage() {
  return <StaticInfoPage {...STATIC_PAGES["docs/rate-limits"]} />;
}
