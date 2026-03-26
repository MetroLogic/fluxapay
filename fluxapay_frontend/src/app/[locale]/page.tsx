import {
  WhyFluxapay,
  Bridges,
  GlobalReach,
  UseCases,
  FAQ,
  Footer,
} from "@/features/landing";
import Hero from "@/features/landing/sections/Hero";

export default function Home() {
  return (
    <div className="">
      <Hero />
      <WhyFluxapay />
      <Bridges />
      <GlobalReach />
      <UseCases />
      <FAQ />
      <Footer />
    </div>
  );
}
