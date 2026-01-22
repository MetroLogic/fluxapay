import { WhyFluxapay, Bridges, GlobalReach } from "@/features/landing";
import Hero from "@/features/landing/sections/Hero";

export default function Home() {
  return (
    <div className="">
      <Hero />
      <WhyFluxapay />
      <Bridges />
      <GlobalReach />
    </div>
  );
}
