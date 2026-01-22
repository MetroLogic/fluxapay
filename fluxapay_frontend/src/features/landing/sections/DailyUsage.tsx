"use client";

import Image from "next/image";
import { Button } from "@/components/Button";
import cardHand from "@/assets/card_hand.png";
import exchangeBoard from "@/assets/exchange_board.png";
import airportPerson from "@/assets/airport_person.png";

const InfoCard = ({ title, subtitle, bgColor }: { title: string, subtitle: string, bgColor: string }) => (
  <div className={`p-8 rounded-[32px] flex flex-col justify-center h-full min-h-[200px] shadow-lg`} style={{ backgroundColor: bgColor }}>
    <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
    <p className="text-white/80 text-sm leading-relaxed max-w-[200px]">
      {subtitle}
    </p>
  </div>
);

const ImageCard = ({ src, alt }: { src: any, alt: string }) => (
  <div className="rounded-[32px] overflow-hidden h-full min-h-[250px] shadow-lg">
    <Image src={src} alt={alt} className="w-full h-full object-cover" />
  </div>
);

export const DailyUsage = () => {
  return (
    <section className="py-24 bg-[#0B0527] text-white overflow-hidden">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-black leading-tight text-white mb-4">
            Just <span className="text-[#FED449] italic font-serif font-normal tracking-tight">enough</span> to get you going <br />
            everyday
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1 */}
          <div className="flex flex-col gap-6">
            <ImageCard src={cardHand} alt="Payment card in hand" />
            <InfoCard 
              title="Personal Transfers" 
              subtitle="Send Love, Send Support, Send Smiles!" 
              bgColor="#35219C" 
            />
          </div>

          {/* Column 2 */}
          <div className="flex flex-col gap-6 md:mt-12">
            <InfoCard 
              title="Business Transfers" 
              subtitle="Boss Moves? We've got your business transfers handled." 
              bgColor="#E58A13" 
            />
            <ImageCard src={airportPerson} alt="Person at airport" />
          </div>

          {/* Column 3 */}
          <div className="flex flex-col gap-6">
            <ImageCard src={exchangeBoard} alt="Currency exchange board" />
            <InfoCard 
              title="Currency exchange" 
              subtitle="Unlock the best exchange rates, and say hello to savings." 
              bgColor="#EE2635" 
            />
          </div>
        </div>

        <div className="mt-16 flex justify-center">
          <Button variant="outline" className="bg-white text-[#2E3539] hover:bg-white/90 border-none rounded-xl px-10 h-14 font-bold text-base shadow-xl transition-all hover:scale-105">
            Get onboarded
          </Button>
        </div>
      </div>
    </section>
  );
};
