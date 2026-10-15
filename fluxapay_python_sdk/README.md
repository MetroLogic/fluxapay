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
- `client.payment_links` — create, get, list, update, delete
- `client.merchants` — me, update_webhook
- `client.invoices` — create, get, list, update_status
- `client.refunds` — create (sends `idempotency_key` as the `Idempotency-Key` header), get, list
- `client.settlements` — list, get, summary
- `client.webhooks` — verify, parse

## Client options

```python
client = FluxaPay(
    api_key="sk_test_...",
    base_url="https://api.fluxapay.com",
    timeout=10.0,                          # seconds
    headers={"X-Client-Name": "acme-shop"},  # sent with every request
)
```

Custom `headers` are added to every request but can't replace the `Authorization` header.

## Error handling

Every API error is a `FluxaPayError` with `status_code`, `code`, `message`, `request_id`,
`raw` (the JSON body), `errors` (field errors on validation failures) and `retryable`.
Catch a subclass to handle one case:

| Exception | Status |
|-----------|--------|
| `BadRequestError` | 400 |
| `AuthenticationError` | 401 |
| `PermissionDeniedError` | 403 (e.g. `KYC_REQUIRED`) |
| `NotFoundError` | 404 |
| `ConflictError` | 409, 410, 422 |
| `RateLimitError` | 429, with `retry_after` in seconds when the server sends `Retry-After` |
| `ServerError` | 5xx |

```python
from fluxapay import BadRequestError, RateLimitError, FluxaPayError

try:
    client.payments.create(amount=0, currency="USDC", customer_email="buyer@example.com")
except BadRequestError as e:
    for err in e.errors:
        print(err["field"], err["message"])
except RateLimitError as e:
    print("retry in", e.retry_after)
except FluxaPayError as e:
    print(e.status_code, e.code, e.request_id)
```

## Testing

The test suite runs against a [respx](https://lundberg.github.io/respx/) mock of the API, so no
sandbox credentials are needed:

```bash
pip install -e ".[dev]"
pytest
```

Shared fixtures with canonical API responses live in `tests/conftest.py`.

## License

MIT
