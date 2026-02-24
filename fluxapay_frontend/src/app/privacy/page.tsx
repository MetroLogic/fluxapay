import InfoLayout from "@/components/legal/InfoLayout";

export default function PrivacyPage() {
  return (
    <InfoLayout title="Privacy Policy">
      <section className="space-y-6">
        <p>Last updated: February 23, 2026</p>
        <h2 className="text-2xl font-semibold">1. Information We Collect</h2>
        <p>
          FluxaPay collects information to provide better services to our users. 
          This includes transaction data on the Stellar blockchain, account details, and 
          usage information.
        </p>
        <h2 className="text-2xl font-semibold">2. How We Use Information</h2>
        <p>
          We use the information to process payments, prevent fraud, and comply 
          with financial regulations.
        </p>
        {/* Add more sections as needed */}
      </section>
    </InfoLayout>
  );
}
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function PrivacyPage() {
  return <StaticInfoPage {...STATIC_PAGES.privacy} />;
}
