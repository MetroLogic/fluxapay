"use client";

import React, { useState } from "react";
import { PlusIcon, MinusIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/Button";

const AccordionItem = ({ question, answer }: { question: string, answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-4 bg-white rounded-2xl shadow-[0_4px_25px_-5px_rgba(0,0,0,0.08)] border border-gray-50 overflow-hidden transition-all duration-300">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-8 py-6 flex items-center justify-between text-left group"
      >
        <span className="text-lg font-bold text-[#2E3539] tracking-tight">{question}</span>
        <div className={`p-2 rounded-lg transition-colors ${isOpen ? 'bg-gray-50' : 'group-hover:bg-gray-50'}`}>
          {isOpen ? <MinusIcon className="w-5 h-5 text-[#2E3539]" /> : <PlusIcon className="w-5 h-5 text-[#2E3539]" />}
        </div>
      </button>
      <div className={`px-8 transition-all duration-300 ease-in-out ${isOpen ? 'pb-8 opacity-100 max-h-[500px]' : 'max-h-0 opacity-0'}`}>
        <p className="text-[#8A8A8A] leading-relaxed">
          {answer}
        </p>
      </div>
    </div>
  );
};

export const FAQ = () => {
  const faqs = [
    {
      question: "What is Fluxapay",
      answer: "Fluxapay is a modern payment infrastructure that bridges crypto and fiat, allowing merchants to accept USDC on Stellar and settle in local fiat currencies instantly."
    },
    {
      question: "What do I need to sign up?",
      answer: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam."
    },
    {
      question: "How fast is onboarding?",
      answer: "Our onboarding process is designed to be as fast as possible. Most merchants can get started within minutes through our automated verification system."
    },
    {
      question: "How many accounts can i create?",
      answer: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam."
    },
    {
      question: "What tech stack do you support?",
      answer: "We provide a flexible API experience that can be integrated into any tech stack, with SDKs for popular languages and a Stripe-like developer experience."
    }
  ];

  return (
    <section className="py-32 bg-white">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div className="max-w-xl">
            <span className="inline-block px-4 py-2 rounded-xl text-[14px] font-bold mb-8 bg-gradient-to-r from-[#8A75EB00] to-[#FAFAFA9E] border border-gray-100 text-[#5F44EC]">
              Frequently Asked questions 🙋‍♀️
            </span>
            <h2 className="text-5xl md:text-6xl font-black text-[#2E3539] leading-[1.1] mb-8">
              Got questions? We got answers!
            </h2>
            <p className="text-xl text-[#8A8A8A] mb-12 leading-relaxed">
              Feel free to reach out to us if you have more questions for us.
            </p>
            <Button variant="dark" className="rounded-2xl px-10 h-14 font-bold text-base gap-2">
              Contact us <span className="opacity-50">→</span>
            </Button>
          </div>

          <div className="w-full">
            {faqs.map((faq, idx) => (
              <AccordionItem key={idx} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
