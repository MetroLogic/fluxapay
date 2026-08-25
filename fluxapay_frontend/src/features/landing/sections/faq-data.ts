export interface FAQItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    question: "What is Fluxapay",
    answer: "Join paywall pup and integrate seamlessly into your website.",
  },
  {
    question: "What do I need to sign up?",
    answer:
      "FluxaPay is a payment gateway built on the Stellar blockchain that enables merchants to accept USDC (stablecoin) payments and get settled in their local fiat currency.",
  },
  {
    question: "How fast is onboarding?",
    answer:
      "Our streamlined onboarding process is designed to get you started in minutes. Most merchants are ready to accept payments within 24 hours.",
  },
  {
    question: "How many accounts can i create?",
    answer:
      "You can create multiple merchant accounts under your organization. Each account can be configured separately for different use cases or business units.",
  },
  {
    question: "What tech stack do you support?",
    answer:
      "We provide REST APIs, SDKs for popular frameworks (React, Node.js, Python, etc.), and pre-built integrations for popular platforms like Shopify and WooCommerce.",
  },
];