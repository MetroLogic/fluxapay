# FluxaPay Python SDK

Python client for the [FluxaPay](https://fluxapay.com) payment gateway.

## Installation

```bash
pip install fluxapay
```

## Quick Start

### Synchronous

```python
from fluxapay import FluxaPay

client = FluxaPay(api_key="sk_live_...")

payment = client.payments.create(
    amount=49.99,
    currency="USD",
    customer_email="buyer@example.com",
    order_id="order_123",
)
print(payment.checkout_url)
```

### Asynchronous

```python
import asyncio
from fluxapay import AsyncFluxaPay

async def main():
    async with AsyncFluxaPay(api_key="sk_live_...") as client:
        payment = await client.payments.create(
            amount=49.99,
            currency="USD",
            customer_email="buyer@example.com",
        )
        print(payment.checkout_url)

asyncio.run(main())
```

### Webhook Verification

```python
from fluxapay import verify_webhook_signature

is_valid = verify_webhook_signature(
    raw_body=request.body,
    signature=request.headers["X-FluxaPay-Signature"],
    timestamp=request.headers["X-FluxaPay-Timestamp"],
    secret="whsec_...",
)
```

## Resources

- `client.payments` — create, get, get_status, list
- `client.settlements` — list, get, summary
- `client.webhooks` — verify, parse

## License

MIT
