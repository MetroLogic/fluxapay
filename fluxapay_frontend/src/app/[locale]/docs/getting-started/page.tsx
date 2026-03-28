import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Getting Started with FluxaPay - Quick Start Guide",
    description: "Learn how to get started with FluxaPay in just a few minutes. Integration guide for developers.",
    slug: "/docs/getting-started",
    keywords: ["getting started", "quick start", "integration", "setup", "tutorial"],
    locale,
  });
}

export default function LocalizedGettingStartedPage() {
  return <StaticInfoPage {...STATIC_PAGES["docs/getting-started"]} />;
}
