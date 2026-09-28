# Payment Status Lifecycle

This document describes every `PaymentStatus` value, what triggers the
transition, and which downstream actions follow.

> Canonical enum is defined in `prisma/schema.prisma` and mirrored in
> `fluxapay_backend/src/types/payment.ts` (TypeScript) and
> `fluxapay_frontend/src/types/payment.ts` (frontend).

---

## States

| Status               | Description                                                                                           |
|----------------------|-------------------------------------------------------------------------------------------------------|
| `pending`            | Payment created; awaiting USDC deposit from the customer.                                             |
| `partially_paid`     | A deposit has been received but it is less than the required USDC amount.                             |
| `confirmed`          | Full USDC amount received and verified on-chain. Settlement processing begins.                        |
| `overpaid`           | More USDC than required was received. Excess handling is per merchant configuration.                  |
| `expired`            | Payment window (15 min default) elapsed without sufficient funds received.                            |
| `failed`             | On-chain verification or settlement processing failed irrecoverably.                                  |
| `paid`               | Synonym for `confirmed` — used in some legacy API responses; maps to confirmed internally.            |
| `completed`          | Settlement has been disbursed to the merchant's bank account.                                         |
| `cancelled`          | Payment was cancelled (e.g. merchant account deleted, admin action).                                  |
| `refunded`           | Full refund has been processed and USDC returned to the payer.                                        |
| `partially_refunded` | A partial refund has been issued; some funds were returned to the payer.                              |

---

## Transition Diagram

```
                         ┌─────────────────────────────────┐
                         │                                 │
                 ┌───────▼──────┐                          │
    CREATE ──►  │   pending     │                          │
                └──────┬───────┘                          │
                       │ partial deposit                   │
                       ▼                                   │
              ┌─────────────────┐                         │
              │ partially_paid  │                         │
              └────────┬────────┘                         │
                       │ full deposit received             │
                       │ (also from pending directly)      │
                       ▼                                   │
               ┌──────────────┐    overpayment             │
               │  confirmed   ├──────────────► overpaid    │
               └──────┬───────┘                │           │
                      │                        │           │
                      │ settlement complete     │ settlement│
                      ▼                        ▼           │
               ┌──────────────┐        ┌──────────────┐   │
               │  completed   │        │  completed   │   │
               └──────┬───────┘        └──────────────┘   │
                      │                                    │
              ┌───────┴────────────┐                       │
              │ refund requested   │                       │
              ▼                   ▼                        │
      ┌──────────────┐  ┌──────────────────────┐          │
      │   refunded   │  │  partially_refunded  │          │
      └──────────────┘  └──────────────────────┘          │
                                                           │
  pending / partially_paid ──► expired (TTL elapsed) ─────┘
  any non-terminal         ──► failed  (processing error)
  any non-terminal         ──► cancelled (admin / account deleted)
```

---

## Terminal States

A terminal state is one that cannot transition further:

- `expired`
- `failed`
- `paid` *(legacy)*
- `completed`
- `refunded`
- `partially_refunded`
- `cancelled`

Polling and SSE connections close once a terminal state is reached.

---

## Webhook Events

| Status transition         | Webhook event emitted         |
|---------------------------|-------------------------------|
| → `pending`               | `payment.pending`             |
| → `confirmed`             | `payment.confirmed`           |
| → `failed`                | `payment.failed`              |
| → `completed`             | `payment.settled`             |
| → `expired`               | `payment.expired`             |
| → `partially_paid`        | `payment.partially_paid`      |
| → `overpaid`              | `payment.overpaid` *(if configured)* |

---

*Last updated: 2026-07-23 — closes issue #626*
