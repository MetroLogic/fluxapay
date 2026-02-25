"use client";

import Image from "next/image";

interface UseCase {
  title: string;
  description: string;
  bgColor: string;
  textColor: string;
  image?: string;
}

const UseCaseCard = ({ title, description, bgColor, textColor, image }: UseCase) => (
  <div
    className={`relative rounded-2xl overflow-hidden ${bgColor} flex flex-col justify-center h-full transition-transform duration-300 hover:scale-[1.03]`}
  >
    {image ? (
      <Image
        src={image}
        alt={title}
        fill
        className="object-cover object-center scale-[1.02]"
        priority
      />
    ) : (
      <div className="p-6 md:p-8 flex flex-col justify-center h-full text-center">
        <h3 className={`text-lg md:text-xl font-bold mb-2 ${textColor}`}>
          {title}
        </h3>
        <p
          className={`text-sm md:text-base leading-relaxed ${textColor === "text-white" ? "text-white/80" : "text-gray-700"
            }`}
        >
          {description}
        </p>
      </div>
    )}
  </div>
);

export const UseCases = () => {
  const useCases: UseCase[] = [
    {
      image: "/usecaseframe/frame1.png",
      title: "",
      description: "",
      bgColor: "bg-white",
      textColor: "text-[#2E3539]"
    },
    {
      title: "Business Transfers",
      description: "Boss Moves? We've got your business transfers handled.",
      bgColor: "bg-[#F5A623]",
      textColor: "text-white"
    },
    {
      image: "/usecaseframe/frame2.png",
      title: "",
      description: "",
      bgColor: "bg-white",
      textColor: "text-[#2E3539]"
    },
    {
      title: "Personal Transfers",
      description: "Send Love, Send Support, Send Smiles!",
      bgColor: "bg-[#5B3EC1]",
      textColor: "text-white"
    },
    {
      image: "/usecaseframe/frame3.png",
      title: "",
      description: "",
      bgColor: "bg-white",
      textColor: "text-[#2E3539]"
    },
    {
      title: "Currency exchange",
      description: "Unlock the best exchange rates, and say hello to savings.",
      bgColor: "bg-[#E5325A]",
      textColor: "text-white"
    }
  ];

  return (
    <section className="py-28 bg-gradient-to-b from-[#0F1117] via-[#121521] to-[#0F1117]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-20 text-center">
          <h2 className="text-2xl md:text-2xl text-center font-extrabold text-white leading-tight">
            Just <span className="text-[#F5A623]">enough</span> to get you going
            <br />
            everyday
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-14">
          <div className="flex flex-col gap-4">
            <div className="h-75">
              <UseCaseCard {...useCases[0]} />
            </div>
            <div className="h-45">
              <UseCaseCard {...useCases[1]} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="h-45">
              <UseCaseCard {...useCases[3]} />
            </div>
            <div className="h-75">
              <UseCaseCard {...useCases[2]} />
            </div>

          </div>

          <div className="flex flex-col gap-4">
            <div className="h-75">
              <UseCaseCard {...useCases[4]} />
            </div>
            <div className="h-45">
              <UseCaseCard {...useCases[5]} />
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <button className="px-10 py-3 rounded-xl bg-white text-[#121521] font-semibold shadow-md transition-all duration-300 hover:scale-105 hover:shadow-xl">
            Get onboarded
          </button>
        </div>
      </div>
    </section>
  );
};
