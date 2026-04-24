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
