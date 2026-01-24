"use client";

import React from "react";
import * as Flags from "country-flag-icons/react/3x2";

const FlagItem = ({ country }: { country: string }) => {
  const Flag = (Flags as Record<string, React.ComponentType<{ title?: string; className?: string }>>)[country];
  if (!Flag) return null;
  return (
    <div className="w-16 h-12 md:w-20 md:h-14 rounded-lg overflow-hidden shadow-sm flex-shrink-0">
      <Flag title={country} className="w-full h-full object-cover" />
    </div>
  );
};

const countries = [
  "RO", "CN", "FR", "CO", "AU", "IE", "DK", "ET", "JP", "GE", "GH", "DE",
  "US", "GB", "NG", "KE", "ZA", "EG", "BR", "CA", "IN", "ES", "IT", "KR",
  "MX", "NL", "NO", "PL", "PT", "RU", "SA", "SE", "TR", "UA", "AE", "VN"
];

export const GlobalReach = () => {
  return (
    <section className="py-24 bg-[#FFFBEE] overflow-hidden relative">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-16">
          <div className="max-w-xl text-center lg:text-left">
            <span className="inline-block px-4 py-1.5 rounded-full text-[13px] font-bold mb-8 bg-gradient-to-r from-[#FEE9A4] to-[#FAFAFA9E] border border-[#FEE9A4]">
              Supercharged for 127+ countries 🚀
            </span>
            <h2 className="text-5xl md:text-6xl font-black text-[#2E3539] leading-[1.1] mb-6">
              From Tokyo to <br />
              Timbuktu, we’ve got <br />
              you <span className="text-[#B62619]">covered</span>
            </h2>
          </div>

          <div className="relative w-full lg:w-1/2 h-[300px] pointer-events-none">
            {/* Top and Bottom Fading Masks */}
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[#FFFBEE] to-transparent z-10"></div>
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#FFFBEE] to-transparent z-10"></div>
            
            <div className="grid grid-cols-4 gap-4 animate-scroll-vertical h-full">
              {/* Duplicate flags for infinite loop look or just a dense grid */}
              {[...countries, ...countries].map((country, idx) => (
                <div key={`${country}-${idx}`} className="flex justify-center">
                  <FlagItem country={country} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll-vertical {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .animate-scroll-vertical {
          animation: scroll-vertical 40s linear infinite;
        }
      `}</style>
    </section>
  );
};
