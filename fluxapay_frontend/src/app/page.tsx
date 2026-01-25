import { WhyFluxapay, Bridges, GlobalReach, UseCases, FAQ, Footer } from "@/features/landing";

export default function Home() {
  return (
    <main className="min-h-screen">
      <WhyFluxapay />
      <Bridges />
      <GlobalReach />
      <UseCases />
      <FAQ />
      <Footer />
    </main>
  );
}
