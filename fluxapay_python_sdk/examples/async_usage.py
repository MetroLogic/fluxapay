"""Async FluxaPay example: create a payment and a payment link concurrently.

Usage:
    export FLUXAPAY_API_KEY=sk_test_...
    # optional, e.g. a local backend:
    export FLUXAPAY_BASE_URL=http://localhost:3000
    python examples/async_usage.py
"""

import asyncio
import os
import sys

from fluxapay import AsyncFluxaPayClient, FluxaPayError


async def main() -> int:
    api_key = os.environ.get("FLUXAPAY_API_KEY")
    if not api_key:
        print("Set FLUXAPAY_API_KEY first (export FLUXAPAY_API_KEY=sk_test_...)", file=sys.stderr)
        return 1
    base_url = os.environ.get("FLUXAPAY_BASE_URL", "https://api.fluxapay.com")

    async with AsyncFluxaPayClient(api_key=api_key, base_url=base_url, timeout=15.0) as client:
        try:
            # Independent calls can run concurrently over the shared connection pool.
            payment, link = await asyncio.gather(
                client.payments.create(
                    amount=25,
                    currency="USDC",
                    customer_email="buyer@example.com",
                    metadata={"source": "async-example"},
                ),
                client.payment_links.create(title="Tip jar", currency="USD"),
            )
        except FluxaPayError as err:
            print(f"FluxaPay error {err.status_code} {err.code}: {err.message}", file=sys.stderr)
            return 2

        print("Checkout URL:   ", payment.checkout_url)
        print("Payment link:   ", link.get("short_url"))

        status = await client.payments.get_status(payment.id)
        print("Payment status: ", status.status)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
