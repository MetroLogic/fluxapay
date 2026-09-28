Key Features
Developer Platform (Stripe-like)
•⁠ ⁠Merchant API for Seamless Integration

Create payments/charges
Fetch payment status
Issue refunds (where supported)
Manage customers & metadata •⁠ ⁠Webhooks (signed per-merchant with timestamped HMAC; see docs)
⁠ payment.created ⁠, ⁠ payment.pending ⁠, ⁠ payment.confirmed ⁠, ⁠ payment.failed ⁠, ⁠ payment.settled ⁠
No-Code / Low-Code
•⁠ ⁠Payment Links

Shareable links for quick checkout (social commerce, WhatsApp, Instagram, etc.) •⁠ ⁠Invoices
Generate invoices with payment links and track payment status
Perfect for freelancers, agencies, and B2B billing
Merchant Tools
•⁠ ⁠Merchant Dashboard & Analytics •⁠ ⁠Reconciliation Reports •⁠ ⁠Built for Emerging Markets

Typical Integrations
1) Checkout on your website/app
•⁠ ⁠Merchant calls FluxaPay API to create a payment •⁠ ⁠Customer completes payment via hosted checkout or embedded flow •⁠ ⁠Fluxapay sends webhook when confirmed •⁠ ⁠Merchant fulfills the order

2) Payment links for invoices & social commerce
•⁠ ⁠Merchant generates a payment link (amount, currency, description) •⁠ ⁠Customer pays using Stellar USDC •⁠ ⁠Merchant is notified via dashboard + webhook/email (optional)

Tech Stack (Planned)
•⁠ ⁠Blockchain: Stellar
•⁠ ⁠Stablecoin Rail: USDC on Stellar
•⁠ ⁠Backend: Node.js (TBD)
•⁠ ⁠Smart Contracts: Stellar Soroban •⁠ ⁠Database: PostgreSQL
•⁠ ⁠APIs: REST + Webhooks
•⁠ ⁠Frontend: Next.js (Merchant Dashboard)
•⁠ ⁠FX & Settlement: On-chain liquidity + payout partners
