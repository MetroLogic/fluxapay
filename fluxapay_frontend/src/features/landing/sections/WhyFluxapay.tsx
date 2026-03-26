"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import animationSvg from "@/assets/animationsvg.svg";

interface WhyCardProps {
  title: string;
  description: string;
  active?: boolean;
}

const WhyCard = ({ title, description, active = false }: WhyCardProps) => (
  <div className={`p-8 rounded-3xl transition-all duration-300 ${active ? 'bg-[#F1EFFF] border-transparent' : 'bg-white border border-gray-100'}`}>
    <h3 className="text-xl font-bold text-[#2E3539] mb-3">{title}</h3>
    <p className="text-[#8A8A8A] leading-relaxed text-sm">
      {description}
    </p>
  </div>
);

export const WhyFluxapay = () => {
  const t = useTranslations("whyFluxapay");
  
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="mb-20">
          <span className="inline-block px-4 py-2 rounded-xl bg-[#F1EFFF] text-[#5F44EC] text-sm font-bold mb-8">
            {t("title")}
          </span>
          <h2 className="text-5xl md:text-6xl font-black text-[#2E3539] leading-[1.1] max-w-2xl">
            {t("subtitle")}
          </h2>
          <p className="mt-8 text-xl text-[#8A8A8A] max-w-2xl leading-relaxed relative">
            {t("subtitle")}
            
            {/* Dotted Arrow */}
            <svg className="absolute -bottom-16 left-0 w-24 h-16 text-[#5F44EC]" viewBox="0 0 100 60" fill="none">
              <path d="M10 10 Q 50 60 90 10" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" fill="none" />
              <path d="M85 15 L 90 10 L 85 5" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <WhyCard 
              title={t("instant.title")}
              description={t("instant.description")}
              active={true}
            />
            <WhyCard 
              title={t("lowFees.title")}
              description={t("lowFees.description")}
            />
            <WhyCard 
              title={t("global.title")}
              description={t("global.description")}
            />
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-[#5F44EC]/5 rounded-full blur-3xl -z-10 animate-pulse"></div>
            <Image 
              src={animationSvg} 
              alt="Fluxapay Illustration" 
              className="w-full h-auto object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
