import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "FluxaPay Documentation - Integration Guides & API Reference",
    description: "Complete documentation for FluxaPay payment integration. Learn how to accept crypto and fiat payments with our APIs and SDKs.",
    slug: "/docs",
    keywords: ["documentation", "API", "integration guide", "payment API", "developer", "SDK"],
    locale,
  });
}

export default function LocalizedDocsPage() {
  return (
    <StaticInfoPage {...STATIC_PAGES.docs} />
  );
}
