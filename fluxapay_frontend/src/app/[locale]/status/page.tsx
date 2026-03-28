import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Status - FluxaPay System Status",
    description: "Check FluxaPay platform status, uptime, and system incidents.",
    slug: "/status",
    keywords: ["status", "uptime", "incidents", "system status"],
    locale,
  });
}

export default function LocalizedStatusPage() {
  return <StaticInfoPage {...STATIC_PAGES.status} />;
}
