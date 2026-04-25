import { Metadata } from "next";
import dynamic from "next/dynamic";
import Hero from "@/features/landing/sections/Hero";
import {
  organizationSchema,
  softwareApplicationSchema,
  jsonLdScript,
} from "@/lib/seo-schemas";
import { generatePageMetadata } from "@/lib/seo";

const WhyFluxapay = dynamic(() => import("@/features/landing").then(mod => mod.WhyFluxapay), { ssr: false });
const Bridges = dynamic(() => import("@/features/landing").then(mod => mod.Bridges), { ssr: false });
const GlobalReach = dynamic(() => import("@/features/landing").then(mod => mod.GlobalReach), { ssr: false });
const UseCases = dynamic(() => import("@/features/landing").then(mod => mod.UseCases), { ssr: false });
const FAQ = dynamic(() => import("@/features/landing").then(mod => mod.FAQ), { ssr: false });
const Footer = dynamic(() => import("@/features/landing").then(mod => mod.Footer), { ssr: false });

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
