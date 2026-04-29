"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

interface PricingFAQProps {
  items: FAQItem[];
}

export default function PricingFAQ({ items }: PricingFAQProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden transition"
          >
            <button
              onClick={() =>
                setExpandedId(isExpanded ? null : item.id)
              }
              className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-slate-50 transition"
            >
              <span className="font-semibold text-slate-900">
                {item.question}
              </span>
              <ChevronDown
                className={`h-5 w-5 text-slate-600 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
            {isExpanded && (
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
                <p className="text-slate-700">{item.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
