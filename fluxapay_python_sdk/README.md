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

with FluxaPay(api_key="sk_live_...") as client:
    payment = client.payments.create(
        amount=49.99,
        currency="USD",
        customer_email="buyer@example.com",
        order_id="order_123",
    )
    print(payment.checkout_url)

    status = client.payments.get_status(payment.id)
    print(status.status)

    payment_details = client.payments.get(payment.id)
    print(payment_details.status)
```

### Asynchronous

The `AsyncFluxaPay` client supports `async with` for clean connection pool
lifecycle management. The underlying `httpx.AsyncClient` is automatically
opened on entry and closed on exit, preventing resource leaks.

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

        status = await client.payments.get_status(payment.id)
        print(status.status)

asyncio.run(main())
```

The client can also be re-used across multiple `async with` blocks. After the
first block exits and closes the connection pool, re-entering via a second
`async with` automatically re-creates the HTTP client:

```python
client = AsyncFluxaPay(api_key="sk_live_...")

# First usage — opens and closes the connection pool
async with client:
    await client.payments.create(...)

# Second usage — re-creates the connection pool on entry
async with client:
    await client.payments.create(...)
```

If you prefer not to use the context manager, call `aclose()` manually to
release the connection pool:

```python
client = AsyncFluxaPay(api_key="sk_live_...")
try:
    payment = await client.payments.create(...)
finally:
    await client.aclose()
```

See `examples/async_usage.py` for complete runnable examples, including FastAPI
integration patterns.

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
