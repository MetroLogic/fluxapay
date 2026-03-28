import { FluxaPay } from "../src";

const client = new FluxaPay({
  apiKey: "sk_test_local_only",
});

const rawBody = JSON.stringify({
  event: "payment_confirmed",
  payment_id: "pay_123",
  merchant_id: "m_123",
  timestamp: new Date().toISOString(),
  data: { amount: 25, currency: "USDC" },
});

const signature = "replace-with-x-fluxapay-signature";
const secret = process.env.FLUXAPAY_WEBHOOK_SECRET || "whsec_demo";
const timestamp = new Date().toISOString();

const isValid = client.webhooks.verify(rawBody, signature, secret, timestamp);

if (!isValid) {
  throw new Error("Invalid webhook signature");
}

const event = client.webhooks.parse(rawBody);
console.log("Verified webhook event", event.event, event.payment_id);
