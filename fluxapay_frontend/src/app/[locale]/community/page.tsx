import { Metadata } from "next";
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "FluxaPay Community - Connect & Collaborate",
    description: "Join the FluxaPay community to connect with developers, merchants, and payment enthusiasts.",
    slug: "/community",
    keywords: ["community", "forum", "discussions", "developers", "collaboration"],
    locale,
  });
}

export default function LocalizedCommunityPage() {
  return <StaticInfoPage {...STATIC_PAGES.community} />;
}
