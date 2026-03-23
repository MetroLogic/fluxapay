import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Privacy Policy - FluxaPay",
    description: "Learn how FluxaPay collects, uses, and protects your personal data and payment information.",
    slug: "/privacy",
    keywords: ["privacy", "policy", "data protection", "GDPR", "security"],
    locale,
  });
}

export default function LocalizedPrivacyPage() {
  return <StaticInfoPage {...STATIC_PAGES.privacy} />;
}
