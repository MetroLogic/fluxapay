import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Authentication - FluxaPay API Documentation",
    description: "Learn about FluxaPay API authentication methods, API keys, and security best practices.",
    slug: "/docs/authentication",
    keywords: ["authentication", "API keys", "OAuth", "security", "authorization"],
    locale,
  });
}

export default function LocalizedAuthenticationPage() {
  return <StaticInfoPage {...STATIC_PAGES["docs/authentication"]} />;
}
