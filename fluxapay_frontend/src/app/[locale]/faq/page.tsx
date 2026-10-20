import type { Metadata } from "next";
import CustomerFaq from "./CustomerFaq";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    title: "Stellar Payment FAQ - FluxaPay",
    description:
      "Answers about Stellar wallets, payment memos, payment amounts, and confirmation status for FluxaPay checkout.",
    slug: "/faq",
    keywords: ["Stellar wallet", "payment memo", "payment confirmation", "customer FAQ"],
    locale,
  });
}

export default function CustomerFaqPage() {
  return <CustomerFaq />;
}
