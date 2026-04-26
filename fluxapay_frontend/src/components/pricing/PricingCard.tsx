import { Link } from "@/i18n/routing";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PricingCardProps = {
  name: string;
  price: string;
  billingPeriod?: string;
  description: string;
  features: string[];
  cta: {
    label: string;
    href: string;
  };
  featured?: boolean;
  badge?: string;
};

export default function PricingCard({
  name,
  price,
  billingPeriod = "per month",
  description,
  features,
  cta,
  featured = false,
  badge,
}: PricingCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-white p-8 shadow-sm transition-all hover:shadow-lg",
        featured
          ? "border-indigo-500 ring-2 ring-indigo-500 ring-offset-4"
          : "border-slate-200"
      )}
    >
      {badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 transform">
          <span className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-1 text-xs font-semibold text-white">
            {badge}
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-2xl font-bold text-slate-900">{name}</h3>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </div>

      <div className="mb-6 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-slate-900">{price}</span>
          {billingPeriod && (
            <span className="text-slate-600">/{billingPeriod}</span>
          )}
        </div>
      </div>

      <Link
        href={cta.href}
        className={cn(
          "mb-8 block w-full rounded-lg px-4 py-3 text-center font-medium transition",
          featured
            ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:shadow-lg"
            : "border border-slate-900 bg-white text-slate-900 hover:bg-slate-50"
        )}
      >
        {cta.label}
      </Link>

      <div className="space-y-3 border-t border-slate-200 pt-6">
        {features.map((feature) => (
          <div key={feature} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
            <span className="text-sm text-slate-700">{feature}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
