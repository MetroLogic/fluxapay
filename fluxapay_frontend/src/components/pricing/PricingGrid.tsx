"use client";

import PricingCard from "./PricingCard";

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: string;
  billingPeriod?: string;
  cta: {
    label: string;
    href: string;
  };
  features: string[];
  featured?: boolean;
  badge?: string;
}

interface PricingGridProps {
  plans: PricingPlan[];
}

export default function PricingGrid({ plans }: PricingGridProps) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3 lg:gap-6">
      {plans.map((plan) => (
        <PricingCard
          key={plan.id}
          name={plan.name}
          description={plan.description}
          price={plan.price}
          billingPeriod={plan.billingPeriod}
          cta={plan.cta}
          features={plan.features}
          featured={plan.featured}
          badge={plan.badge}
        />
      ))}
    </div>
  );
}
