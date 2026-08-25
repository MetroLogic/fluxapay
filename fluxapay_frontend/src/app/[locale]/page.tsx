import { Metadata } from "next";
import Hero from "@/features/landing/sections/Hero";
import {
  WhyFluxapay,
  Bridges,
  GlobalReach,
  UseCases,
  FAQ,
  Footer,
} from "@/features/landing";
import {
  faqSchema,
  organizationSchema,
  softwareApplicationSchema,
} from "@/lib/seo-schemas";
import { createJsonLdScript, generatePageMetadata } from "@/lib/seo";
import { FAQ_ITEMS } from "@/features/landing/sections/faq-data";


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    title: "FluxaPay | Global Payment Infrastructure",
    description: "The next generation of global payments. Accept crypto and fiat seamlessly with FluxaPay's payment infrastructure.",
    slug: "",
    keywords: ["payments", "crypto payments", "fiat payments", "payment gateway", "global payments", "payment infrastructure"],
    locale,
  });
}

export default function Home() {
  const orgSchema = organizationSchema();
  const appSchema = softwareApplicationSchema({
    name: "FluxaPay",
    description:
      "Global payment infrastructure that lets merchants accept crypto and fiat payments seamlessly.",
    operatingSystem: ["Web"],
  });
  const faqPageSchema = faqSchema(FAQ_ITEMS);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: createJsonLdScript(orgSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: createJsonLdScript(appSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: createJsonLdScript(faqPageSchema),
        }}
      />
      <div className="">
        <Hero />
        <WhyFluxapay />
        <Bridges />
        <GlobalReach />
        <UseCases />
        <FAQ />
        <Footer />
      </div>
    </>
  );
}
