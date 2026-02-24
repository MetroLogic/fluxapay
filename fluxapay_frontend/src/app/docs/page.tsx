import InfoLayout from "@/components/legal/InfoLayout";

export default function DocsPage() {
  return (
    <InfoLayout title="Documentation">
      <section className="space-y-6">
        <div className="p-6 rounded-lg bg-white/5">
          <h2 className="text-xl font-mono text-blue-400 mb-2">GET /api/v1/payments</h2>
          <p>Retrieve a list of all transactions associated with your merchant ID.</p>
        </div>
        <h2 className="text-2xl font-semibold">Integration Guide</h2>
        <p>To start accepting USDC, integrate our hosted checkout or use our SDK for a custom experience on the Stellar network.</p>
      </section>
    </InfoLayout>
  );
}
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function DocsPage() {
  return <StaticInfoPage {...STATIC_PAGES.docs} />;
}
