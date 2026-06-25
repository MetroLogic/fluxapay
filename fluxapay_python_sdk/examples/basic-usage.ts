import { FluxaPay } from "../src";

async function main() {
  const client = new FluxaPay({
    apiKey: process.env.FLUXAPAY_API_KEY || "sk_test_your_key",
    baseUrl: process.env.FLUXAPAY_BASE_URL || "http://localhost:3000",
  });

  const payment = await client.payments.create({
    amount: 25,
    currency: "USDC",
    customer_email: "merchant-customer@example.com",
    order_id: "order_demo_001",
    metadata: {
      campaign: "spring-launch",
      customerTier: "gold",
    },
  });

  console.log("Created payment", {
    id: payment.id,
    checkoutUrl: payment.checkout_url,
    status: payment.status,
  });
}

main().catch((error) => {
  console.error("Example failed", error);
  process.exit(1);
});
