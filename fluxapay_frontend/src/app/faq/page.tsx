import InfoLayout from "@/components/legal/InfoLayout";

export default function FAQPage() {
  const faqs = [
    { q: "What is Stellar USDC?", a: "A fully reserved digital dollar stablecoin issued by Circle on the Stellar network." },
    { q: "How fast are settlements?", a: "Stellar transactions typically clear in 3-5 seconds." },
    { q: "Do I need a Stellar wallet?", a: "Yes, to receive funds directly, you will need a Stellar-compatible wallet." }
  ];

  return (
    <InfoLayout title="FAQs">
      <div className="space-y-8">
        {faqs.map((faq, i) => (
          <div key={i} className="border-b border-white/5 pb-6">
            <h3 className="text-lg font-medium text-white mb-2">{faq.q}</h3>
            <p className="text-[#A0A0A0]">{faq.a}</p>
          </div>
        ))}
      </div>
    </InfoLayout>
  );
}