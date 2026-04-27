Fluxapay is a payment gateway on the Stellar blockchain that enables merchants to accept crypto payments and get settled in their local fiat currency.

FluxaPay bridges the gap between crypto payments and real-world commerce—making stablecoin payments as easy to integrate as Stripe.

---

## What Problem does Fluxapay solve?

Despite growing crypto adoption, everyday commerce remains largely fiat-based.

A major pain point is that crypto-native customers are forced to offramp every time they want to pay a merchant. This introduces:

•⁠  ⁠Extra fees from offramping and FX conversions  
•⁠  ⁠Payment delays and failed transactions  
•⁠  ⁠Poor checkout experience for crypto users  
•⁠  ⁠Lost sales for merchants  

At the same time, merchants want to accept crypto without holding volatile assets, managing wallets, or dealing with on-chain complexity.

Fluxapay solves this by enabling *USDC-in → fiat-out* payments with a merchant-friendly experience.

## How FluxaPay Works

1.⁠ ⁠*Merchant Creates a Charge*  
   Merchant creates a payment request via API or Payment Link.

2.⁠ ⁠*Customer Pays in USDC (Stellar)*  
   Customer pays from any supported Stellar wallet.

3.⁠ ⁠*Instant Verification*  
   FluxaPay verifies the payment on-chain and updates the payment status in real-time.

4.⁠ ⁠*Settlement to Merchant (Local Fiat)*  
   FluxaPay converts and settles the value to the merchant’s preferred local currency via bank transfer or supported payout channels.


## Key Features

### Developer Platform (Stripe-like)
•⁠  ⁠*Merchant API for Seamless Integration*
  - Create payments/charges
  - Fetch payment status
  - Issue refunds (where supported)
  - Manage customers & metadata
•⁠  ⁠*Webhooks*
  - ⁠ payment.created ⁠, ⁠ payment.pending ⁠, ⁠ payment.confirmed ⁠, ⁠ payment.failed ⁠, ⁠ payment.settled ⁠

### No-Code / Low-Code
•⁠  ⁠*Payment Links*
  - Shareable links for quick checkout (social commerce, WhatsApp, Instagram, etc.)
•⁠  ⁠*Invoices*
  - Generate invoices with payment links and track payment status
  - Perfect for freelancers, agencies, and B2B billing

### Merchant Tools
•⁠  ⁠Merchant Dashboard & Analytics
•⁠  ⁠Reconciliation Reports
•⁠  ⁠Built for Emerging Markets

## Typical Integrations

### 1) Checkout on your website/app
•⁠  ⁠Merchant calls FluxaPay API to create a payment
•⁠  ⁠Customer completes payment via hosted checkout or embedded flow
•⁠  ⁠Fluxapay sends webhook when confirmed
•⁠  ⁠Merchant fulfills the order

### 2) Payment links for invoices & social commerce
•⁠  ⁠Merchant generates a payment link (amount, currency, description)
•⁠  ⁠Customer pays using Stellar USDC
•⁠  ⁠Merchant is notified via dashboard + webhook/email (optional)

##  Tech Stack (Planned)

•⁠  ⁠*Blockchain:* Stellar  
•⁠  ⁠*Stablecoin Rail:* USDC on Stellar  
•⁠  ⁠*Backend:* Node.js (TBD)  
•⁠  ⁠*Smart Contracts:* Stellar Soroban 
•⁠  ⁠*Database:* PostgreSQL  
•⁠  ⁠*APIs:* REST + Webhooks  
•⁠  ⁠*Frontend:* Next.js (Merchant Dashboard)  
•⁠  ⁠*FX & Settlement:* On-chain liquidity + payout partners  

## Use Cases

•⁠  ⁠E-commerce stores and marketplaces
•⁠  ⁠SaaS and subscription businesses
•⁠  ⁠Freelancers & agencies (invoices + payment links)
•⁠  ⁠Cross-border payments for global customers
•⁠  ⁠Merchants in emerging markets accepting stablecoin payments

## Vision

Make stablecoin payments simple, practical, and accessible so merchants can sell globally while customers pay directly with USDC, without offramping friction.

##  Roadmap

•⁠  ⁠[ ] Core payment gateway (USDC on Stellar)
•⁠  ⁠[ ] Merchant dashboard
•⁠  ⁠[ ] API for payments + webhooks
•⁠  ⁠[ ] Payment links
•⁠  ⁠[ ] Invoicing
•⁠  ⁠[ ] SDKs
•⁠  ⁠[ ] Fiat settlement integrations
•⁠  ⁠[ ] Refunds & dispute tooling (where applicable)
•⁠  ⁠[ ] Multi-currency support & expanded stablecoins

## Contributing

Contributions are welcome!  
Open an issue or submit a PR to help build Fluxapay.

### API Documentation & Testing

FluxaPay uses OpenAPI 3.0.0 for API documentation. We enforce contract testing to ensure docs stay in sync with implementation.

**Quick Start:**
```bash
# Validate OpenAPI spec
npm run validate:openapi

# Check route documentation coverage
npm run check:route-coverage

# Run contract tests
npm run test:contract
```

**Learn more:** See [docs/OPENAPI_CONTRACT_TESTING.md](docs/OPENAPI_CONTRACT_TESTING.md) for complete guide on documenting endpoints and understanding contract tests.

For an implementation-aligned API walkthrough (auth, payment creation, payment status polling/streaming, and webhook verification), see [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

## Telegram link

https://t.me/+m23gN14007w0ZmQ0

## Security Hardening Notes

Backend responses now use Helmet defaults plus route-specific CSP profiles:

- API routes use strict CSP: `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`
- Swagger docs route uses a relaxed CSP needed by Swagger UI.

For reverse proxy deployments, see:

- `docs/REVERSE_PROXY_SECURITY_HEADERS.md`

## Payment Metadata Guardrails

Create payment metadata is now protected with configurable abuse controls:

- `PAYMENT_METADATA_MAX_BYTES` (default: `16384`)
- `PAYMENT_METADATA_MAX_DEPTH` (default: `5`)

User-provided string fields in metadata are sanitized to strip HTML/script content before storage.

## Stellar Congestion Fee Strategy

Transaction submission now retries with bounded fee bumps. Configuration:

- `STELLAR_BASE_FEE` (default: `100`)
- `STELLAR_MAX_FEE` (default: `2000`)
- `STELLAR_FEE_BUMP_MULTIPLIER` (default: `2`)
- `STELLAR_TX_MAX_RETRIES` (default: `3`)

Details are documented in:

- `docs/STELLAR_FEE_BUMP_STRATEGY.md`
