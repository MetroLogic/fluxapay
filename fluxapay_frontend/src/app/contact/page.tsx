import InfoLayout from "@/components/legal/InfoLayout";

export default function ContactPage() {
  return (
    <InfoLayout title="Contact Us">
      <p className="mb-8">Have questions? We're here to help you bridge the gap between crypto and fiat.</p>
      <div className="grid gap-6">
        <div>
          <h3 className="text-white font-bold">Email Support</h3>
          <p className="text-blue-400">support@fluxapay.com</p>
        </div>
        <div>
          <h3 className="text-white font-bold">Technical Inquiries</h3>
          <p className="text-blue-400">dev@fluxapay.com</p>
        </div>
      </div>
    </InfoLayout>
  );
}
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function ContactPage() {
  return <StaticInfoPage {...STATIC_PAGES.contact} />;
}
