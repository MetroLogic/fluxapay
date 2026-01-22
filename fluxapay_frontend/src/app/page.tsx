import { Navbar, Hero, WhyFluxapay, Bridges, GlobalReach, DailyUsage, FAQ, Footer } from "@/features/landing";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <WhyFluxapay />
      <Bridges />
      <GlobalReach />
      <DailyUsage />
      <FAQ />
      <Footer />
    </main>
  );
}
