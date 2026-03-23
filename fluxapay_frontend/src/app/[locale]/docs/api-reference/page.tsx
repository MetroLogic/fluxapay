import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "API Reference - FluxaPay REST API Documentation",
    description: "Complete FluxaPay REST API reference with endpoints, request/response examples, and error codes.",
    slug: "/docs/api-reference",
    keywords: ["API", "REST API", "endpoints", "reference", "documentation", "integration"],
    locale,
  });
}

export default function LocalizedApiReferencePage() {
  return <StaticInfoPage {...STATIC_PAGES["docs/api-reference"]} />;
}
