# Fluxapay

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
•⁠  ⁠*Webhooks* (signed per-merchant with timestamped HMAC; see docs)
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

## Getting Started with Docker Compose

A complete local development environment is provided via Docker Compose, running the backend, frontend, PostgreSQL, and Redis.

### Prerequisites
- Docker and Docker Compose installed.

### Setup
1. Copy the example environment variables:
   ```bash
   cp .env.example .env
   ```
2. (Optional) Adjust `.env` variables if necessary.

### Running the Stack
To build and start the entire stack:
```bash
docker compose up --build
```

The services will be available at:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### Stopping Services
To stop the stack without losing database data:
```bash
docker compose stop
```
To stop and remove containers (data in volumes remains):
```bash
docker compose down
```

### Rebuilding
If you change `package.json` or Dockerfiles:
```bash
docker compose up --build
```

### Troubleshooting
- **Database Connection Issues:** Ensure `POSTGRES_USER` and `POSTGRES_PASSWORD` in `.env` match what's expected.
- **Port Conflicts:** If ports 3000, 3001, 5432, or 6379 are already in use, you may need to stop local services or change the port mappings in `docker-compose.yml`.
- **Logs:** View logs for a specific service using `docker compose logs -f <service_name>` (e.g., `docker compose logs -f fluxapay_backend`).

## Contributing

https://t.me/+m23gN14007w0ZmQ0
