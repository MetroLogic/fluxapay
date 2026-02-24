import InfoLayout from "@/components/legal/InfoLayout";

export default function PricingPage() {
  return (
    <InfoLayout title="Pricing">
      <div className="grid md:grid-cols-2 gap-8 mt-8">
        <div className="p-8 rounded-2xl bg-white/5 border border-white/10">
          <h3 className="text-xl font-bold mb-2">Standard Merchant</h3>
          <p className="text-3xl font-bold mb-4">1% <span className="text-sm font-normal text-gray-400">per transaction</span></p>
          <ul className="space-y-2 text-[#A0A0A0]">
            <li>✓ USDC on Stellar Settlement</li>
            <li>✓ Basic Analytics Dashboard</li>
            <li>✓ Email Support</li>
          </ul>
        </div>
        <div className="p-8 rounded-2xl bg-blue-600/10 border border-blue-500/30">
          <h3 className="text-xl font-bold mb-2">Enterprise</h3>
          <p className="text-3xl font-bold mb-4">Custom</p>
          <ul className="space-y-2 text-[#A0A0A0]">
            <li>✓ Volume-based discounts</li>
            <li>✓ Priority API Support</li>
            <li>✓ Dedicated Account Manager</li>
          </ul>
        </div>
      </div>
    </InfoLayout>
  );
}
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function PricingPage() {
  return <StaticInfoPage {...STATIC_PAGES.pricing} />;
}
