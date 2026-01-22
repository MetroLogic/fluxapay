import { WhyFluxapay, Bridges, GlobalReach } from "@/features/landing";
import Hero from "@/features/landing/sections/Hero";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <WhyFluxapay />
      <Bridges />
      <GlobalReach />
    </main>
  );
}
