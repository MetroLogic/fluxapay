"""
FluxaPay Python SDK — Async Usage Examples

This module demonstrates how to use the ``AsyncFluxaPay`` client with async
context managers (``async with``) in modern async frameworks like FastAPI,
Starlette, and aiohttp.

The async context manager ensures the underlying httpx.AsyncClient connection
pool is cleanly opened and closed, preventing resource leaks.
"""

import asyncio

from fluxapay import AsyncFluxaPay, FluxaPayError


# ── Example 1: Basic async context manager ────────────────────────────────────

async def basic_async_context_manager() -> None:
    """Create a payment using the async context manager.

    The httpx.AsyncClient is automatically opened on entry and closed on exit,
    releasing all connection pool resources.
    """
    async with AsyncFluxaPay(api_key="sk_live_...") as client:
        payment = await client.payments.create(
            amount=49.99,
            currency="USD",
            customer_email="buyer@example.com",
        )
        print(f"Payment created: {payment.id}")
        print(f"Checkout URL: {payment.checkout_url}")

        # Poll for payment status
        status = await client.payments.get_status(payment.id)
        print(f"Payment status: {status.status}")


# ── Example 2: Error handling with async context manager ──────────────────────

async def error_handling() -> None:
    """Handle API errors within the async context manager.

    If an exception occurs inside the ``async with`` block, the context
    manager still ensures the HTTP connection pool is properly closed.
    """
    async with AsyncFluxaPay(api_key="sk_live_...") as client:
        try:
            payment = await client.payments.create(
                amount=1000.00,
                currency="USD",
                customer_email="buyer@example.com",
            )
        except FluxaPayError as e:
            print(f"API error: {e.status_code} — {e.message}")
            # The connection pool is still closed even when an error is raised


# ── Example 3: Re-entry after closure ──────────────────────────────────────────

async def re_entry_after_closure() -> None:
    """Re-use the same client instance across multiple async context manager blocks.

    After the first ``async with`` block exits and closes the connection pool,
    the client automatically recreates the httpx.AsyncClient on the next
    ``async with`` entry. This enables patterns like:

        client = AsyncFluxaPay(api_key="sk_live_...")

        async with client:
            await client.payments.create(...)

        # Connection pool is now closed.

        async with client:
            # Connection pool is automatically re-created.
            await client.payments.create(...)
    """
    client = AsyncFluxaPay(api_key="sk_live_...")

    # First usage — opens and closes the connection pool
    async with client:
        payment1 = await client.payments.create(
            amount=10.00,
            currency="USD",
            customer_email="buyer1@example.com",
        )
        print(f"First payment: {payment1.id}")

    # Connection pool is now closed.

    # Second usage — re-enters, re-creates the connection pool
    async with client:
        payment2 = await client.payments.create(
            amount=20.00,
            currency="USD",
            customer_email="buyer2@example.com",
        )
        print(f"Second payment: {payment2.id}")

    # Connection pool is closed again.


# ── Example 4: FastAPI integration ─────────────────────────────────────────────

def fastapi_example() -> None:
    """Pattern for using AsyncFluxaPay in a FastAPI application.

    In a FastAPI app, create the client once at startup and use it across
    request handlers with the async context manager:

    .. code-block:: python

        from fastapi import FastAPI
        from fluxapay import AsyncFluxaPay

        app = FastAPI()
        fluxapay_client = AsyncFluxaPay(api_key="sk_live_...")

        @app.post("/payments")
        async def create_payment(amount: float, email: str):
            async with fluxapay_client as client:
                payment = await client.payments.create(
                    amount=amount,
                    currency="USD",
                    customer_email=email,
                )
                return {"id": payment.id, "checkout_url": payment.checkout_url}

        @app.on_event("shutdown")
        async def shutdown():
            await fluxapay_client.aclose()
    """
    print("See the docstring of this function for a FastAPI integration example.")


# ── Example 5: Manual close with aclose() ─────────────────────────────────────

async def manual_close() -> None:
    """Use ``aclose()`` directly instead of the context manager.

    If you prefer not to use ``async with``, call ``aclose()`` manually to
    release the connection pool:

    .. code-block:: python

        client = AsyncFluxaPay(api_key="sk_live_...")
        try:
            payment = await client.payments.create(...)
        finally:
            await client.aclose()
    """
    client = AsyncFluxaPay(api_key="sk_live_...")
    try:
        # Use the client...
        await client.payments.create(
            amount=5.00,
            currency="USD",
            customer_email="buyer@example.com",
        )
    finally:
        await client.aclose()


# ── Run examples ───────────────────────────────────────────────────────────────

async def main() -> None:
    print("=== FluxaPay Async Usage Examples ===")
    print()

    # Note: These examples use a placeholder API key.
    # Replace with a real key to run against the FluxaPay API,
    # or mock the HTTP calls in your test suite.

    print("Example: Basic async context manager")
    print("  async with AsyncFluxaPay(api_key='sk_live_...') as client:")
    print("      payment = await client.payments.create(...)")
    print()

    print("Example: Re-entry after closure")
    print("  client = AsyncFluxaPay(api_key='sk_live_...')")
    print("  async with client:  # opens pool")
    print("      ...")
    print("  async with client:  # re-opens pool (re-entry supported)")
    print("      ...")
    print()

    print("Example: Manual close")
    print("  client = AsyncFluxaPay(api_key='sk_live_...')")
    print("  try:")
    print("      ...")
    print("  finally:")
    print("      await client.aclose()")
    print()

    print("See the function docstrings above for complete runnable examples.")
    print("Import this module and call the async functions directly:")
    print()
    print("  asyncio.run(basic_async_context_manager())")
    print("  asyncio.run(re_entry_after_closure())")
    print("  asyncio.run(manual_close())")


if __name__ == "__main__":
    asyncio.run(main())
