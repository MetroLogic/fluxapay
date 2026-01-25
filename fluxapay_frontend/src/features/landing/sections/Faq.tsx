"use client";

import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQAccordion = ({
  item,
  isOpen,
  onToggle,
}: {
  item: FAQItem; 
  isOpen: boolean;
  onToggle: () => void;
}) => (
  <div className="border border-gray-200 rounded-xl mb-4 last:mb-0 overflow-hidden bg-white">
    <button
      onClick={onToggle}
      className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors duration-200"
    >
      <h3 className="text-lg md:text-xl font-semibold text-[#2E3539] text-left">
        {item.question}
      </h3>

      {/* + / - Indicator */}
      <span className="ml-4 flex items-center justify-center w-6 h-6 text-2xl font-medium text-[#2E3539]">
        {isOpen ? "−" : "+"}
      </span>
    </button>

    {isOpen && (
      <div className="px-6 pb-6">
        <p className="text-[#8A8A8A] leading-relaxed text-base">
          {item.answer}
        </p>
      </div>
    )}
  </div>
);

function FAQContent() {
  const [openIndex, setOpenIndex] = useState(0);

  const faqItems: FAQItem[] = [
    {
      question: "What is Fluxapay",
      answer: "Join paywall pup and integrate seamlessly into your website.",
    },
    {
      question: "What do I need to sign up?",
      answer:
        "FluxaPay is a payment gateway built on the Stellar blockchain that enables merchants to accept USDC (stablecoin) payments and get settled in their local fiat currency.",
    },
    {
      question: "How fast is onboarding?",
      answer:
        "Our streamlined onboarding process is designed to get you started in minutes. Most merchants are ready to accept payments within 24 hours.",
    },
    {
      question: "How many accounts can i create?",
      answer:
        "You can create multiple merchant accounts under your organization. Each account can be configured separately for different use cases or business units.",
    },
    {
      question: "What tech stack do you support?",
      answer:
        "We provide REST APIs, SDKs for popular frameworks (React, Node.js, Python, etc.), and pre-built integrations for popular platforms like Shopify and WooCommerce.",
    },
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14">
          {/* Left Column */}
          <div>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F1EFFF] text-[#5F44EC] text-sm font-semibold mb-6">
              Frequently Asked questions 🙋‍♀️
            </span>

            <h2 className="text-4xl md:text-5xl font-extrabold text-[#2E3539] leading-tight mb-6">
              Got questions? We got answers!
            </h2>

            <p className="text-[#8A8A8A] text-base leading-relaxed mb-8 max-w-md">
              Feel free to reach out to us if you have more questions for us.
            </p>

            <button className="inline-flex items-center gap-2 px-6 py-3 bg-[#2E3539] text-white font-semibold rounded-lg hover:bg-[#1A1D23] transition-colors">
              Contact us →
            </button>
          </div>

          {/* Right Column */}
          <div>
            {faqItems.map((item, index) => (
              <FAQAccordion
                key={index}
                item={item}
                isOpen={openIndex === index}
                onToggle={() =>
                  setOpenIndex(openIndex === index ? -1 : index)
                }
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export const FAQ = FAQContent;
