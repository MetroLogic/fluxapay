import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "FluxaPay Pricing - Transparent Payment Processing Fees",
    description: "Competitive, transparent pricing for crypto and fiat payment processing. No hidden fees. Choose the plan that fits your business.",
    slug: "/pricing",
    keywords: ["pricing", "payment fees", "rates", "payment processing", "merchant fees"],
    locale,
  });
}

export default function LocalizedPricingPage() {
  return <StaticInfoPage {...STATIC_PAGES.pricing} />;
}
