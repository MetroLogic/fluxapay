import { Metadata } from "next";
import {
  WhyFluxapay,
  Bridges,
  GlobalReach,
  UseCases,
  FAQ,
  Footer,
} from "@/features/landing";
import Hero from "@/features/landing/sections/Hero";
import {
  organizationSchema,
  softwareApplicationSchema,
  jsonLdScript,
} from "@/lib/seo-schemas";
import { generatePageMetadata } from "@/lib/seo";

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

  return (
    <>
      {/* Organization structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          orgSchema as Record<string, unknown>
        )}
      />
      {/* SoftwareApplication structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          appSchema as Record<string, unknown>
        )}
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
