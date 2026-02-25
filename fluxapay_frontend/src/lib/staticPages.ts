import type { StaticInfoPageProps } from "@/components/docs/StaticInfoPage";
import { DOCS_URLS } from "@/lib/docs";

export const STATIC_PAGES: Record<string, StaticInfoPageProps> = {
  docs: {
    eyebrow: "Documentation",
    title: "FluxaPay Docs",
    description:
      "Technical guides for integrating payments, managing authentication, and scaling safely.",
    ctas: [
      { label: "API Reference", href: DOCS_URLS.API_REFERENCE },
      { label: "Getting Started", href: DOCS_URLS.GETTING_STARTED },
    ],
    sections: [
      {
        title: "Developer Portal",
        body: "Start in the Developer Portal to generate keys and test requests before going live.",
      },
      {
        title: "What You Can Build",
        body: "Use FluxaPay APIs for checkout flows, settlements, and webhook-based reconciliation.",
      },
    ],
  },
  "docs/api-reference": {
    eyebrow: "Documentation",
    title: "API Reference",
    description: "Overview of endpoints, request formats, and response structures.",
    ctas: [{ label: "View Full Docs", href: DOCS_URLS.FULL_DOCS }],
    sections: [
      {
        title: "Core API Areas",
        body: "Use these core capabilities to complete payment and settlement workflows.",
        bullets: ["Payments", "Webhooks", "Settlements", "Merchant profile"],
      },
      {
        title: "Response Format",
        body: "All endpoints return predictable JSON payloads to simplify SDK and client handling.",
      },
    ],
  },
  "docs/getting-started": {
    eyebrow: "Documentation",
    title: "Getting Started",
    description: "Go from account setup to first successful API request quickly.",
    ctas: [{ label: "Authentication Guide", href: DOCS_URLS.AUTHENTICATION }],
    sections: [
      {
        title: "Integration Checklist",
        body: "Complete these steps before moving to production.",
        bullets: [
          "Create merchant account",
          "Generate API key",
          "Configure webhook URL",
          "Run end-to-end test payment",
        ],
      },
      {
        title: "Go-Live",
        body: "Switch from test mode to live credentials once monitoring and alerts are configured.",
      },
    ],
  },
  "docs/authentication": {
    eyebrow: "Documentation",
    title: "Authentication",
    description: "Secure your API usage with bearer token authentication and key hygiene.",
    ctas: [{ label: "Rate Limits", href: DOCS_URLS.RATE_LIMITS }],
    sections: [
      {
        title: "Bearer Authentication",
        body: "Pass your API key as a bearer token in the Authorization header for protected routes.",
      },
      {
        title: "Security Best Practices",
        body: "Store keys in secure environment variables and rotate credentials on a regular schedule.",
      },
    ],
  },
  "docs/rate-limits": {
    eyebrow: "Documentation",
    title: "Rate Limits",
    description: "Understand request throttling and how to design resilient clients.",
    ctas: [{ label: "Support", href: DOCS_URLS.SUPPORT }],
    sections: [
      {
        title: "Default Limits",
        body: "Limit thresholds apply per API key to preserve stability for all tenants.",
      },
      {
        title: "Recommended Client Behavior",
        body: "Use exponential backoff, retries with jitter, and idempotent request keys.",
      },
    ],
  },
  community: {
    eyebrow: "Resources",
    title: "Community",
    description: "Connect with builders shipping with FluxaPay.",
    ctas: [{ label: "Support", href: DOCS_URLS.SUPPORT }],
    sections: [
      {
        title: "Developer Collaboration",
        body: "Use community spaces to share implementation patterns and integration tips.",
      },
      {
        title: "Feedback Loop",
        body: "Report docs gaps and product friction so we can prioritize improvements.",
      },
    ],
  },
  status: {
    eyebrow: "Operations",
    title: "System Status",
    description: "Current operational health for core FluxaPay services.",
    ctas: [{ label: "Contact Support", href: DOCS_URLS.CONTACT }],
    sections: [
      {
        title: "Current State",
        body: "All services are operational and monitored continuously.",
      },
      {
        title: "Incident Communication",
        body: "Status updates are posted promptly with mitigation steps and resolution timelines.",
      },
    ],
  },
  support: {
    eyebrow: "Help",
    title: "Support",
    description: "Get technical help from the FluxaPay support team.",
    ctas: [
      { label: "FAQs", href: DOCS_URLS.FAQS },
      { label: "Contact", href: DOCS_URLS.CONTACT },
    ],
    sections: [
      {
        title: "When to Contact Support",
        body: "Reach out for API errors, onboarding blockers, settlement questions, and account issues.",
      },
      {
        title: "What to Include",
        body: "Share request IDs, timestamps, and environment details for faster resolution.",
      },
    ],
  },
  faqs: {
    eyebrow: "Help",
    title: "FAQs",
    description: "Answers to common merchant and integration questions.",
    ctas: [{ label: "Pricing", href: DOCS_URLS.PRICING }],
    sections: [
      {
        title: "How fast is onboarding?",
        body: "Most merchants can complete setup and send their first test request in minutes.",
      },
      {
        title: "Can I use webhooks?",
        body: "Yes. Webhooks are supported for payment lifecycle and settlement notifications.",
      },
    ],
  },
  contact: {
    eyebrow: "Company",
    title: "Contact",
    description: "Reach the FluxaPay team for product, sales, or support requests.",
    ctas: [{ label: "Developer Docs", href: DOCS_URLS.FULL_DOCS }],
    sections: [
      {
        title: "Support",
        body: "For technical help, include API request IDs and timestamps so we can investigate quickly.",
      },
      {
        title: "Sales",
        body: "For volume pricing and partnerships, share expected transaction volume and regions.",
      },
    ],
  },
  pricing: {
    eyebrow: "Product",
    title: "Pricing",
    description: "Transparent pricing for teams integrating global payment flows.",
    ctas: [
      { label: "Get Started", href: DOCS_URLS.GETTING_STARTED },
      { label: "Contact Sales", href: DOCS_URLS.CONTACT },
    ],
    sections: [
      {
        title: "Simple Tiers",
        body: "Pricing scales with usage, with options for startups through enterprise merchants.",
      },
      {
        title: "Enterprise Options",
        body: "Custom SLAs and dedicated support are available for high-volume integrations.",
      },
    ],
  },
  privacy: {
    eyebrow: "Legal",
    title: "Privacy Policy",
    description: "How FluxaPay collects, uses, and safeguards merchant and user data.",
    sections: [
      {
        title: "Information We Process",
        body: "We process account details, transaction metadata, and support interactions to operate and secure the platform.",
      },
      {
        title: "Data Protection",
        body: "We apply technical and organizational safeguards for confidentiality, integrity, and availability.",
      },
    ],
  },
  terms: {
    eyebrow: "Legal",
    title: "Terms of Service",
    description: "The rules and responsibilities for using FluxaPay products and APIs.",
    sections: [
      {
        title: "Service Usage",
        body: "You agree to use the platform lawfully and in compliance with applicable payment regulations.",
      },
      {
        title: "Accounts and Access",
        body: "You are responsible for maintaining account security and protecting credentials.",
      },
    ],
  },
};
