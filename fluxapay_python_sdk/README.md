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

`AsyncFluxaPayClient` is the async/await client for FastAPI, Starlette, Django async views
and any other asyncio code. It runs on `httpx.AsyncClient`, and every method has the same
name, arguments and return type as the synchronous client. You just `await` it.

```python
import asyncio
from fluxapay import AsyncFluxaPayClient

async def main():
    async with AsyncFluxaPayClient(api_key="sk_live_...") as client:
        payment = await client.payments.create(
            amount=49.99,
            currency="USDC",
            customer_email="buyer@example.com",
            idempotency_key="order-1234",  # optional, makes retries safe
        )
        print(payment.checkout_url)

        status = await client.payments.get_status(payment.id)
        print(status.status)

        link = await client.payment_links.create(title="Pro plan", currency="USD", amount=25)
        print(link["short_url"])

asyncio.run(main())
```

Resources: `payments`, `payment_links`, `invoices`, `refunds`, `settlements`, `merchants`
(all awaitable) and `webhooks` (`verify` / `parse`, which are plain functions because they
never touch the network).

Options:

```python
AsyncFluxaPayClient(
    api_key="sk_test_...",
    base_url="https://api.fluxapay.com",
    timeout=10.0,                        # seconds
    headers={"X-Client-Name": "acme"},   # added to every request
    http_client=my_httpx_async_client,   # optional; reuse your own pool/transport
)
```

Always close the client: use `async with`, or call `await client.aclose()`. If you pass your
own `http_client`, closing it stays your job.

**FastAPI:** create one client for the app's lifetime and share it across requests:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fluxapay import AsyncFluxaPayClient

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncFluxaPayClient(api_key="sk_live_...") as client:
        app.state.fluxapay = client
        yield

app = FastAPI(lifespan=lifespan)

@app.post("/checkout")
async def checkout(request: Request):
    payment = await request.app.state.fluxapay.payments.create(
        amount=49.99, currency="USDC", customer_email="buyer@example.com"
    )
    return {"checkout_url": payment.checkout_url}
```

A runnable script is in [`examples/async_usage.py`](examples/async_usage.py). The older
`AsyncFluxaPay` class is still available for existing code.

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
