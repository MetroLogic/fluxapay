import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Frequently Asked Questions - FluxaPay",
    description: "Find answers to common questions about FluxaPay, payment processing, crypto payments, integration, and more.",
    slug: "/faqs",
    keywords: ["FAQ", "questions", "answers", "help", "support", "payment questions"],
    locale,
  });
}

export default function LocalizedFaqsPage() {
  return <StaticInfoPage {...STATIC_PAGES.faqs} />;
}
