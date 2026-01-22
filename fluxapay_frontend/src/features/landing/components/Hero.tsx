"use client";

import { Button } from "@/components/Button";

const FloatingBadge = ({ flag, currency, amount, className }: any) => (
  <div className={`absolute bg-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 animate-bounce-slow ${className}`}>
    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-100 font-bold text-xs">
      {flag}
    </div>
    <div>
      <p className="text-[10px] text-gray-500 font-medium leading-tight">Transfer</p>
      <p className="text-sm font-bold text-[#2E3539]">{amount} {currency}</p>
    </div>
  </div>
);

export const Hero = () => {
  return (
    <section className="relative min-h-screen bg-[#0F0A1E] overflow-hidden flex items-center justify-center pt-20">
      {/* Background Sphere/Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-b from-[#5F44EC]/30 to-transparent blur-[120px] opacity-40"></div>
      
      {/* Grid Pattern (Subtle) */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:40px_40px]"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative mb-12">
            <h1 className="text-5xl md:text-8xl font-black tracking-tight text-white mb-6 leading-[1.1]">
              Accept <span className="text-[#FED449] font-serif italic font-normal tracking-normal">Crypto</span> <br />
              Get Paid in Fiat Instantly
            </h1>
            
            {/* Floating Badges */}
            <FloatingBadge 
              flag="🇳🇬" 
              currency="NGN" 
              amount="20,000" 
              className="top-0 -left-12 md:-left-20 hidden sm:flex" 
            />
            <FloatingBadge 
              flag="🇰🇪" 
              currency="KHS" 
              amount="5,000" 
              className="-top-24 left-1/2 -translate-x-1/2 hidden md:flex" 
            />
            <FloatingBadge 
              flag="🇬🇭" 
              currency="GHS" 
              amount="5,000" 
              className="top-0 -right-12 md:-right-20 hidden sm:flex" 
            />
          </div>

          <p className="text-lg md:text-xl text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed">
            Fluxapay lets merchants accept USDC payments on Stellar and get settled in local fiat with a Stripe-like API and no on-chain complexity.
          </p>

          <Button size="lg" className="bg-white text-[#2E3539] hover:bg-white/90 rounded-2xl px-12 h-[60px] text-lg font-bold transition-all hover:scale-105 active:scale-95">
            Join Fluxapay
          </Button>
        </div>
      </div>

      {/* Decorative Planet Edge at Bottom */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1200px] h-[500px] bg-gradient-to-t from-[#5F44EC]/20 to-transparent rounded-full blur-[100px] -mb-[400px]"></div>
    </section>
  );
};
