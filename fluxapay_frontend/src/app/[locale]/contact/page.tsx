import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Contact FluxaPay - Get Support & Information",
    description: "Get in touch with the FluxaPay team for support, questions, partnerships, or business inquiries.",
    slug: "/contact",
    keywords: ["contact", "support", "inquiry", "business", "partnership", "email"],
    locale,
  });
}

export default function LocalizedContactPage() {
  return <StaticInfoPage {...STATIC_PAGES.contact} />;
}
