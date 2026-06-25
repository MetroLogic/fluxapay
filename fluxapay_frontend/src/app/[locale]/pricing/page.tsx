import { Metadata } from "next";
import { generatePageMetadata } from "@/lib/seo";
import PricingGrid, { PricingPlan } from "@/components/pricing/PricingGrid";
import ComparisonTable, { ComparisonFeature } from "@/components/pricing/ComparisonTable";
import PricingFAQ, { FAQItem } from "@/components/pricing/PricingFAQ";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "FluxaPay Pricing - Transparent Payment Processing Fees",
    description: "Competitive, transparent pricing for crypto and fiat payment processing. No hidden fees. Choose the plan that fits your business.",
    slug: "/pricing",
    keywords: ["pricing", "payment fees", "rates", "payment processing", "merchant fees"],
    locale,
  });
}

const plans: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for new businesses and startups.",
    price: "0%",
    billingPeriod: " + 30¢ per tx",
    cta: {
      label: "Get Started",
      href: "/signup",
    },
    features: [
      "Standard Payment Processing",
      "Basic Reporting",
      "Email Support",
      "Standard APIs",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    description: "Ideal for scaling businesses.",
    price: "Custom",
    billingPeriod: "contact sales",
    cta: {
      label: "Sign Up",
      href: "/signup",
    },
    features: [
      "Advanced Payment Processing",
      "Advanced Reporting",
      "Priority Support",
      "Custom Integrations",
    ],
    featured: true,
    badge: "Most Popular",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For large scale operations.",
    price: "Custom",
    billingPeriod: "contact sales",
    cta: {
      label: "Contact Sales",
      href: "/contact",
    },
    features: [
      "Dedicated Account Manager",
      "Custom SLAs",
      "24/7 Phone Support",
      "Volume Discounts",
    ],
  },
];

const comparisonFeatures: ComparisonFeature[] = [
  {
    category: "Payment Processing",
    features: [
      { name: "Credit/Debit Cards", starter: true, growth: true, enterprise: true },
      { name: "ACH Transfers", starter: true, growth: true, enterprise: true },
      { name: "Crypto Payments", starter: false, growth: true, enterprise: true },
    ]
  },
  {
    category: "Support",
    features: [
      { name: "Email", starter: true, growth: true, enterprise: true },
      { name: "Priority", starter: false, growth: true, enterprise: true },
      { name: "24/7 Phone", starter: false, growth: false, enterprise: true },
    ]
  }
];

const faqItems: FAQItem[] = [
  {
    id: "faq-1",
    question: "What payment methods do you support?",
    answer: "We support all major credit cards, debit cards, and ACH transfers. Crypto payments are available on higher tiers."
  },
  {
    id: "faq-2",
    question: "Are there any hidden fees?",
    answer: "No, we believe in transparent pricing. You only pay what's listed on our pricing page."
  },
  {
    id: "faq-3",
    question: "Can I switch plans later?",
    answer: "Absolutely! You can upgrade or downgrade your plan at any time from your account settings."
  }
];

export default function LocalizedPricingPage() {
  return (
    <div className="bg-slate-50 min-h-screen py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-24">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-4 text-xl text-slate-600">
            Choose the perfect plan for your business. No hidden fees.
          </p>
        </div>

        {/* Pricing Grid */}
        <section>
          <PricingGrid plans={plans} />
        </section>

        {/* Comparison Table */}
        <section className="space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">Compare Plans</h2>
            <p className="mt-4 text-lg text-slate-600">Find the right set of features for your needs</p>
          </div>
          <ComparisonTable features={comparisonFeatures} />
        </section>

        {/* FAQ Section */}
        <section className="max-w-3xl mx-auto space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">Frequently Asked Questions</h2>
          </div>
          <PricingFAQ items={faqItems} />
        </section>
      </div>
    </div>
  );
}
