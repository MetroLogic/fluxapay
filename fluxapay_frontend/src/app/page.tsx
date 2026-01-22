import { Navbar, Hero, WhyFluxapay, Bridges } from "@/features/landing";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <WhyFluxapay />
      <Bridges />
      
      <footer className="py-12 border-t border-border bg-white">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm font-bold text-[#2E3539]">FluxaPay</div>
          <p className="text-sm text-[#8A8A8A]">
            &copy; {new Date().getFullYear()} FluxaPay Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-8 text-sm font-semibold text-[#8A8A8A]">
            <a href="#" className="hover:text-[#2E3539] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#2E3539] transition-colors">Terms</a>
            <a href="#" className="hover:text-[#2E3539] transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
