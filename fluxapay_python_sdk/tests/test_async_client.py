"""pytest-asyncio tests for ``AsyncFluxaPayClient`` (issue #1264).

HTTP is mocked with respx, so no sandbox credentials are needed. The suite
runs in pytest-asyncio's auto mode (see ``pyproject.toml``).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import inspect
import json
import time
from typing import Any, Dict

import httpx
import pytest
import respx

from fluxapay import (
    AsyncFluxaPayClient,
    FluxaPay,
    FluxaPayError,
    Invoice,
    Payment,
    PaymentConfirmedEvent,
    PaymentStatus,
)

BASE = "https://api.fluxapay.com"
API_KEY = "sk_test_async_123"

PAYMENT: Dict[str, Any] = {
    "id": "pay_123",
    "amount": 49.99,
    "currency": "USDC",
    "status": "pending",
    "checkout_url": "https://pay.fluxapay.com/pay/pay_123",
    "stellar_address": "GABC123",
    "customer_email": "buyer@example.com",
    "created_at": "2026-01-01T00:00:00Z",
    "expires_at": "2026-01-01T00:30:00Z",
}

PAYMENT_LINK: Dict[str, Any] = {
    "id": "cm4link000001",
    "slug": "k3j9x2ab",
    "title": "Pro plan - monthly",
    "amount": 25,
    "currency": "USD",
    "active": True,
    "short_url": "https://pay.fluxapay.com/pay/k3j9x2ab",
}

INVOICE: Dict[str, Any] = {
    "id": "inv_123",
    "customer_name": "Buyer",
    "customer_email": "buyer@example.com",
    "currency": "USDC",
    "amount": 75.0,
    "status": "draft",
    "due_date": None,
    "created_at": "2026-01-01T00:00:00Z",
}


def sent_json(route: respx.Route) -> Dict[str, Any]:
    return json.loads(route.calls.last.request.content)


@pytest.fixture
def api():
    with respx.mock(base_url=BASE, assert_all_called=False) as router:
        yield router


@pytest.fixture
async def client():
    async with AsyncFluxaPayClient(api_key=API_KEY) as c:
        yield c


# ── construction, headers and lifecycle ──────────────────────────────────────


def test_requires_api_key() -> None:
    with pytest.raises(ValueError):
        AsyncFluxaPayClient(api_key="")


async def test_sends_auth_version_and_custom_headers(api: respx.MockRouter) -> None:
    route = api.get("/api/payments/pay_123").mock(return_value=httpx.Response(200, json=PAYMENT))

    async with AsyncFluxaPayClient(
        api_key=API_KEY,
        headers={"X-Client-Name": "acme", "Authorization": "Bearer nope"},
    ) as c:
        await c.payments.get("pay_123")

    headers = route.calls.last.request.headers
    assert headers["Authorization"] == f"Bearer {API_KEY}"
    assert headers["X-API-Version"] == "v1"
    assert headers["Content-Type"] == "application/json"
    assert headers["X-Client-Name"] == "acme"


async def test_context_manager_closes_owned_http_client() -> None:
    c = AsyncFluxaPayClient(api_key=API_KEY)
    async with c as entered:
        assert entered is c
    assert c._http.is_closed


async def test_injected_http_client_is_used_and_left_open() -> None:
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=PAYMENT)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    async with AsyncFluxaPayClient(api_key=API_KEY, base_url="https://sandbox.test/", http_client=http) as c:
        payment = await c.payments.get("pay_123")

    assert payment.id == "pay_123"
    assert str(seen[0].url) == "https://sandbox.test/api/payments/pay_123"
    assert not http.is_closed, "caller-owned client must not be closed"
    await http.aclose()


async def test_concurrent_requests_share_one_client(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    api.get("/api/payments/pay_1").mock(return_value=httpx.Response(200, json={**PAYMENT, "id": "pay_1"}))
    api.get("/api/payments/pay_2").mock(return_value=httpx.Response(200, json={**PAYMENT, "id": "pay_2"}))

    first, second = await asyncio.gather(client.payments.get("pay_1"), client.payments.get("pay_2"))

    assert (first.id, second.id) == ("pay_1", "pay_2")


# ── payments ─────────────────────────────────────────────────────────────────


async def test_payments_create(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    route = api.post("/api/payments").mock(return_value=httpx.Response(201, json=PAYMENT))

    payment = await client.payments.create(
        amount=49.99,
        currency="USDC",
        customer_email="buyer@example.com",
        metadata={"order_id": "ord_1"},
        idempotency_key="order-1",
    )

    assert isinstance(payment, Payment)
    assert payment.checkout_url.endswith("/pay/pay_123")
    assert sent_json(route) == {
        "amount": 49.99,
        "currency": "USDC",
        "customer_email": "buyer@example.com",
        "metadata": {"order_id": "ord_1"},
    }
    assert route.calls.last.request.headers["Idempotency-Key"] == "order-1"


async def test_payments_get_status_and_list(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    api.get("/api/payments/pay_123").mock(
        return_value=httpx.Response(200, json={**PAYMENT, "status": "confirmed", "unknown_field": 1})
    )
    list_route = api.get("/api/payments").mock(return_value=httpx.Response(200, json={"payments": [PAYMENT], "total": 1}))

    status = await client.payments.get_status("pay_123")
    assert isinstance(status, PaymentStatus)
    assert status.status == "confirmed"

    listed = await client.payments.list(page=2, limit=5, status="pending")
    assert listed["total"] == 1
    params = list_route.calls.last.request.url.params
    assert (params["page"], params["limit"], params["status"]) == ("2", "5", "pending")


# ── payment links ────────────────────────────────────────────────────────────


async def test_payment_links_crud(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    create = api.post("/api/v1/payment-links").mock(return_value=httpx.Response(201, json=PAYMENT_LINK))
    api.get("/api/v1/payment-links/cm4link000001").mock(return_value=httpx.Response(200, json=PAYMENT_LINK))
    list_route = api.get("/api/v1/payment-links").mock(
        return_value=httpx.Response(200, json={"data": [PAYMENT_LINK], "meta": {"total": 1, "page": 1, "limit": 20}})
    )
    update = api.patch("/api/v1/payment-links/cm4link000001").mock(
        return_value=httpx.Response(200, json={**PAYMENT_LINK, "active": False})
    )
    delete = api.delete("/api/v1/payment-links/cm4link000001").mock(return_value=httpx.Response(204))

    link = await client.payment_links.create(title="Pro plan - monthly", currency="USD", amount=25)
    assert link["short_url"].endswith("/k3j9x2ab")
    assert sent_json(create) == {"title": "Pro plan - monthly", "currency": "USD", "amount": 25}

    assert (await client.payment_links.get("cm4link000001"))["slug"] == "k3j9x2ab"

    listed = await client.payment_links.list(active=True, limit=20)
    assert listed["meta"]["total"] == 1
    assert list_route.calls.last.request.url.params["active"] == "true"

    updated = await client.payment_links.update("cm4link000001", active=False)
    assert updated["active"] is False
    assert sent_json(update) == {"active": False}

    assert await client.payment_links.delete("cm4link000001") is None
    assert delete.called


async def test_open_amount_link_omits_amount(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    route = api.post("/api/v1/payment-links").mock(return_value=httpx.Response(201, json={**PAYMENT_LINK, "amount": None}))
    await client.payment_links.create(title="Tip jar", currency="USD")
    assert "amount" not in sent_json(route)


# ── invoices, refunds, settlements, merchants ────────────────────────────────


async def test_invoices(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    api.post("/api/v1/invoices").mock(return_value=httpx.Response(201, json={"data": INVOICE}))
    api.get("/api/v1/invoices/inv_123").mock(return_value=httpx.Response(200, json={"data": INVOICE}))
    api.get("/api/v1/invoices").mock(return_value=httpx.Response(200, json={"data": {"invoices": [INVOICE]}}))
    status_route = api.patch("/api/v1/invoices/inv_123/status").mock(
        return_value=httpx.Response(200, json={"data": {**INVOICE, "status": "paid"}})
    )

    created = await client.invoices.create(amount=75.0, currency="USDC", customer_email="buyer@example.com")
    assert isinstance(created, Invoice) and created.id == "inv_123"
    assert (await client.invoices.get("inv_123")).status == "draft"
    assert (await client.invoices.list(search="buyer"))["data"]["invoices"][0]["id"] == "inv_123"
    assert (await client.invoices.update_status("inv_123", "paid")).status == "paid"
    assert sent_json(status_route) == {"status": "paid"}


async def test_refunds_send_idempotency_key(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    route = api.post("/api/v1/refunds").mock(return_value=httpx.Response(201, json={"id": "ref_1"}))
    api.get("/api/v1/refunds/ref_1").mock(return_value=httpx.Response(200, json={"id": "ref_1"}))
    api.get("/api/v1/refunds").mock(return_value=httpx.Response(200, json={"refunds": [], "total": 0}))

    created = await client.refunds.create(payment_id="pay_123", amount=5, idempotency_key="refund-1")
    assert created["id"] == "ref_1"
    assert route.calls.last.request.headers["Idempotency-Key"] == "refund-1"
    assert (await client.refunds.get("ref_1"))["id"] == "ref_1"
    assert (await client.refunds.list(payment_id="pay_123"))["total"] == 0


async def test_settlements(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    list_route = api.get("/api/settlements").mock(return_value=httpx.Response(200, json={"settlements": [], "total": 0}))
    api.get("/api/settlements/summary").mock(return_value=httpx.Response(200, json={"total": 10}))
    api.get("/api/settlements/set_1").mock(return_value=httpx.Response(200, json={"id": "set_1"}))

    assert (await client.settlements.list(currency="NGN"))["total"] == 0
    assert list_route.calls.last.request.url.params["currency"] == "NGN"
    assert (await client.settlements.summary())["total"] == 10
    assert (await client.settlements.get("set_1"))["id"] == "set_1"


async def test_merchants(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    api.get("/api/v1/merchants/me").mock(
        return_value=httpx.Response(200, json={"message": "Merchant found", "merchant": {"id": "m_1"}})
    )
    route = api.patch("/api/v1/merchants/me/webhook").mock(
        return_value=httpx.Response(200, json={"webhook_url": "https://x.test/hook"})
    )

    assert (await client.merchants.me())["id"] == "m_1"
    assert (await client.merchants.update_webhook("https://x.test/hook"))["webhook_url"] == "https://x.test/hook"
    assert sent_json(route) == {"webhook_url": "https://x.test/hook"}


# ── errors ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("status", [400, 401, 404, 429, 500, 503])
async def test_api_errors_raise_fluxapay_error(
    api: respx.MockRouter, client: AsyncFluxaPayClient, status: int
) -> None:
    api.get("/api/v1/payment-links/missing").mock(
        return_value=httpx.Response(
            status,
            json={"code": "SOME_CODE", "message": "nope"},
            headers={"X-Request-ID": "req_1"},
        )
    )

    with pytest.raises(FluxaPayError) as exc_info:
        await client.payment_links.get("missing")

    err = exc_info.value
    assert err.status_code == status
    assert err.code == "SOME_CODE"
    assert err.request_id == "req_1"
    assert err.retryable is (status in (429, 502, 503, 504))


async def test_network_errors_propagate(api: respx.MockRouter, client: AsyncFluxaPayClient) -> None:
    api.get("/api/payments/pay_123").mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(httpx.ConnectError):
        await client.payments.get("pay_123")


# ── webhooks ─────────────────────────────────────────────────────────────────


def test_webhook_helpers_match_sync_client() -> None:
    client = AsyncFluxaPayClient(api_key=API_KEY)
    body = json.dumps(
        {
            "event": "payment_confirmed",
            "payment_id": "pay_123",
            "merchant_id": "m_1",
            "timestamp": "2026-01-01T00:00:00Z",
            "data": {},
        }
    )
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    sig = hmac.new(b"whsec_x", f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()

    assert client.webhooks.verify(body, sig, "whsec_x", timestamp=ts) is True
    assert client.webhooks.verify(body, "0" * 64, "whsec_x", timestamp=ts) is False
    assert isinstance(client.webhooks.parse(body), PaymentConfirmedEvent)


# ── parity with the synchronous client ───────────────────────────────────────

SYNC_RESOURCES = ["payments", "invoices", "refunds", "settlements"]


@pytest.mark.parametrize("resource", SYNC_RESOURCES)
def test_async_methods_mirror_sync_client(resource: str) -> None:
    sync_resource = getattr(FluxaPay(api_key=API_KEY), resource)
    async_resource = getattr(AsyncFluxaPayClient(api_key=API_KEY), resource)

    sync_methods = {
        name for name, _ in inspect.getmembers(sync_resource, inspect.ismethod) if not name.startswith("_")
    }
    assert sync_methods, resource
    for name in sync_methods:
        method = getattr(async_resource, name, None)
        assert method is not None, f"{resource}.{name} missing on AsyncFluxaPayClient"
        assert inspect.iscoroutinefunction(method), f"{resource}.{name} must be async"

        sync_params = list(inspect.signature(getattr(sync_resource, name)).parameters)
        async_params = list(inspect.signature(method).parameters)
        assert async_params[: len(sync_params)] == sync_params, (resource, name)
