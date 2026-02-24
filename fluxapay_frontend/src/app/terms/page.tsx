import InfoLayout from "@/components/legal/InfoLayout";

export default function TermsPage() {
  return (
    <InfoLayout title="Terms of Use">
      <section className="space-y-6">
        <p>By accessing FluxaPay, you agree to comply with these terms. Please read them carefully.</p>
        <h2 className="text-2xl font-semibold">1. Services</h2>
        <p>FluxaPay provides a gateway for Stellar-based USDC transactions. We are not a bank; we are a software provider facilitating blockchain interactions.</p>
        <h2 className="text-2xl font-semibold">2. User Responsibilities</h2>
        <p>Users are responsible for maintaining the security of their private keys and wallet credentials. FluxaPay cannot recover funds lost due to compromised keys.</p>
      </section>
    </InfoLayout>
  );
}
import StaticInfoPage from "@/components/docs/StaticInfoPage";
import { STATIC_PAGES } from "@/lib/staticPages";

export default function TermsPage() {
  return <StaticInfoPage {...STATIC_PAGES.terms} />;
}
