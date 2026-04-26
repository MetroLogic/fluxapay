"use client";

import PricingCard, { type PricingPlan } from "./PricingCard";

interface PricingGridProps {
  plans: PricingPlan[];
}

export default function PricingGrid({ plans }: PricingGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-6">
      {plans.map((plan) => (
        <PricingCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}
