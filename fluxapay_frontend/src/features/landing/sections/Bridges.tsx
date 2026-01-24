"use client";

import { 
  PaperPlaneIcon, 
  FileTextIcon, 
  UpdateIcon, 
  GlobeIcon, 
  CodeIcon,
  BackpackIcon
} from "@radix-ui/react-icons";

interface FeatureCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const FeatureCard = ({ icon: Icon, title, description }: FeatureCardProps) => (
  <div className="relative pl-8 py-4 group">
    {/* Left accent line */}
    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gray-100 group-hover:bg-gray-200 transition-colors">
      <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-[#5F44EC]"></div>
    </div>
    
    <div className="mb-6">
      <div className="w-12 h-12 bg-white rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] flex items-center justify-center border border-gray-50">
        <Icon className="w-6 h-6 text-[#2E3539]" />
      </div>
    </div>
    
    <h3 className="text-xl font-bold text-[#2E3539] mb-3">{title}</h3>
    <p className="text-[#8A8A8A] text-base leading-relaxed max-w-[340px]">
      {description}
    </p>
  </div>
);

export const Bridges = () => {
  const features = [
    {
      icon: PaperPlaneIcon,
      title: "USDC-to-Fiat Settlement",
      description: "Accept USDC payments and get settled in your local currency. No volatility, no crypto handling required."
    },
    {
      icon: BackpackIcon,
      title: "Merchant Dashboard & Analytics",
      description: "Monitor transactions, payouts, and performance with built-in analytics and reconciliation reports."
    },
    {
      icon: FileTextIcon,
      title: "Payment Links & Invoicing",
      description: "Get paid via shareable links and invoices perfect for social commerce, freelancers, and B2B billing."
    },
    {
      icon: UpdateIcon,
      title: "Real-Time Confirmation",
      description: "Instant payment verification on Stellar with live status updates via webhooks."
    },
    {
      icon: GlobeIcon,
      title: "Built for Emerging Markets",
      description: "Optimized for low fees, fast settlement, and local payout rails across emerging economies."
    },
    {
      icon: CodeIcon,
      title: "Stripe-Like Developer API",
      description: "Create charges, track payment status, handle refunds, and integrate fast with a familiar API experience."
    }
  ];

  return (
    <section className="py-32 bg-[#F9FAFB]/50">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-5xl font-black text-[#2E3539] mb-6 leading-tight">
            Fluxapay Bridges Crypto Payments and <br className="hidden md:block" /> Real-World Commerce
          </h2>
          <p className="text-xl text-[#8A8A8A]">
            Stablecoin payments, as easy to integrate as Stripe.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
          {features.map((feature, index) => (
            <FeatureCard 
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
