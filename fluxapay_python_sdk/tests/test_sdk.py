"""Tests for the FluxaPay Python SDK."""

import json
import hashlib
import hmac
import time
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
import httpx
import respx

from fluxapay import (
    FluxaPay,
    AsyncFluxaPay,
    FluxaPayError,
    Payment,
    PaymentStatus,
    Invoice,
    CustomerResponse,
    PaymentLinkResponse,
    PaymentResponse,
    RefundResponse,
    verify_webhook_signature,
)

BASE = "https://api.fluxapay.com"
API_KEY = "sk_live_test"

PAYMENT_FIXTURE = {
    "id": "pay_123",
    "amount": 49.99,
    "currency": "USD",
    "status": "pending",
    "checkout_url": "https://pay.fluxapay.com/pay_123",
    "stellar_address": "GABC123",
    "customer_email": "buyer@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "expires_at": "2024-01-01T00:30:00Z",
}

INVOICE_FIXTURE = {
    "id": "inv_123",
    "customer_name": "Buyer",
    "customer_email": "buyer@example.com",
    "currency": "USDC",
    "amount": 75.0,
    "status": "draft",
    "due_date": None,
    "created_at": "2024-01-01T00:00:00Z",
    "line_items": [],
    "notes": None,
}

REFUND_FIXTURE = {
    "id": "ref_123",
    "payment_id": "pay_123",
    "amount": 25.0,
    "status": "pending",
}


# ── Sync client ───────────────────────────────────────────────────────────────


@respx.mock
def test_payments_create():
    respx.post(f"{BASE}/api/payments").mock(return_value=httpx.Response(200, json=PAYMENT_FIXTURE))
    client = FluxaPay(api_key=API_KEY)
    payment = client.payments.create(amount=49.99, currency="USD", customer_email="buyer@example.com")
    assert isinstance(payment, Payment)
    assert payment.id == "pay_123"
    assert payment.status == "pending"


@respx.mock
def test_payments_get():
    respx.get(f"{BASE}/api/payments/pay_123").mock(return_value=httpx.Response(200, json=PAYMENT_FIXTURE))
    client = FluxaPay(api_key=API_KEY)
    payment = client.payments.get("pay_123")
    assert payment.checkout_url == PAYMENT_FIXTURE["checkout_url"]


def test_response_models_parse_values_and_preserve_dict_access():
    payment = PaymentResponse.model_validate(PAYMENT_FIXTURE)
    assert payment.amount == Decimal("49.99")
    assert payment.created_at == datetime(2024, 1, 1, tzinfo=timezone.utc)
    assert payment["id"] == "pay_123"
    assert payment.to_dict()["amount"] == Decimal("49.99")

    customer = CustomerResponse.model_validate({"id": "cus_1", "email": "buyer@example.com"})
    link = PaymentLinkResponse.model_validate({
        "id": "plink_1",
        "slug": "monthly-support",
        "title": "Monthly support",
        "amount": "12.50",
        "currency": "USD",
        "expiry": "2024-02-01T00:00:00Z",
        "customer": customer.to_dict(),
        "created_at": "2024-01-01T00:00:00Z",
    })
    assert link.amount == Decimal("12.50")
    assert link.expiry == datetime(2024, 2, 1, tzinfo=timezone.utc)
    assert isinstance(link.customer, CustomerResponse)

    refund = RefundResponse.model_validate({
        "id": "ref_123",
        "payment_id": "pay_123",
        "amount": "25.00",
        "currency": "USD",
        "status": "pending",
        "created_at": "2024-01-02T00:00:00Z",
    })
    assert refund.amount == Decimal("25.00")
    assert refund.created_at == datetime(2024, 1, 2, tzinfo=timezone.utc)
    assert refund.get("missing") is None


def test_response_models_accept_backend_field_names():
    payment = PaymentResponse.model_validate({
        **PAYMENT_FIXTURE,
        "createdAt": PAYMENT_FIXTURE["created_at"],
        "expiration": PAYMENT_FIXTURE["expires_at"],
        "customerId": "cus_1",
    })
    assert payment.customer_id == "cus_1"

    refund = RefundResponse.model_validate({
        "id": "ref_123",
        "paymentId": "pay_123",
        "amount": "25.00",
        "status": "pending",
    })
    assert refund.payment_id == "pay_123"


@respx.mock
def test_payments_get_status():
    respx.get(f"{BASE}/api/payments/pay_123").mock(return_value=httpx.Response(200, json=PAYMENT_FIXTURE))
    client = FluxaPay(api_key=API_KEY)
    status = client.payments.get_status("pay_123")
    assert isinstance(status, PaymentStatus)
    assert status.status == "pending"


@respx.mock
def test_payments_list():
    payload = {"payments": [PAYMENT_FIXTURE], "total": 1}
    respx.get(f"{BASE}/api/payments").mock(return_value=httpx.Response(200, json=payload))
    client = FluxaPay(api_key=API_KEY)
    result = client.payments.list(page=1, limit=10)
    assert result["total"] == 1


@respx.mock
def test_settlements_list():
    payload = {"settlements": [], "total": 0}
    respx.get(f"{BASE}/api/settlements").mock(return_value=httpx.Response(200, json=payload))
    client = FluxaPay(api_key=API_KEY)
    result = client.settlements.list()
    assert result["total"] == 0


@respx.mock
def test_invoices_create_get_list_and_update_status():
    respx.post(f"{BASE}/api/v1/invoices").mock(
        return_value=httpx.Response(201, json={"data": INVOICE_FIXTURE})
    )
    respx.get(f"{BASE}/api/v1/invoices/inv_123").mock(
        return_value=httpx.Response(200, json={"data": INVOICE_FIXTURE})
    )
    respx.get(f"{BASE}/api/v1/invoices").mock(
        return_value=httpx.Response(200, json={"data": {"invoices": [INVOICE_FIXTURE], "total": 1}})
    )
    respx.patch(f"{BASE}/api/v1/invoices/inv_123/status").mock(
        return_value=httpx.Response(200, json={"data": INVOICE_FIXTURE})
    )
    client = FluxaPay(api_key=API_KEY)

    invoice = client.invoices.create(
        amount=75.0,
        currency="USDC",
        customer_email="buyer@example.com",
        customer_name="Buyer",
    )
    assert isinstance(invoice, Invoice)
    assert invoice.id == "inv_123"
    assert invoice.updated_at is None
    assert respx.calls[0].request.content == (
        b'{"amount":75.0,"currency":"USDC","customer_email":"buyer@example.com","customer_name":"Buyer"}'
    )
    assert client.invoices.get("inv_123").id == "inv_123"
    assert client.invoices.list(page=2, status="draft")["data"]["total"] == 1
    assert client.invoices.update_status("inv_123", "paid").status == "draft"
    assert respx.calls[-1].request.content == b'{"status":"paid"}'


@respx.mock
def test_refunds_create_get_and_list():
    respx.post(f"{BASE}/api/v1/refunds").mock(
        return_value=httpx.Response(201, json=REFUND_FIXTURE)
    )
    respx.get(f"{BASE}/api/v1/refunds/ref_123").mock(
        return_value=httpx.Response(200, json=REFUND_FIXTURE)
    )
    respx.get(f"{BASE}/api/v1/refunds").mock(
        return_value=httpx.Response(200, json={"refunds": [REFUND_FIXTURE], "total": 1})
    )
    client = FluxaPay(api_key=API_KEY)

    created = client.refunds.create(payment_id="pay_123", amount=25.0, reason="duplicate")
    assert created["id"] == "ref_123"
    assert client.refunds.get("ref_123")["payment_id"] == "pay_123"
    assert client.refunds.list(payment_id="pay_123")["total"] == 1
    assert respx.calls[0].request.content == (
        b'{"payment_id":"pay_123","amount":25.0,"reason":"duplicate"}'
    )


@respx.mock
def test_raises_fluxapay_error_on_4xx():
    respx.post(f"{BASE}/api/payments").mock(
        return_value=httpx.Response(401, json={"message": "Unauthorized", "code": "UNAUTHORIZED"}, headers={"X-Request-ID": "req_test_123"})
    )
    client = FluxaPay(api_key=API_KEY)
    with pytest.raises(FluxaPayError) as exc_info:
        client.payments.create(amount=1, currency="USD", customer_email="x@x.com")
    assert exc_info.value.status_code == 401
    assert exc_info.value.code == "UNAUTHORIZED"
    assert exc_info.value.request_id == "req_test_123"
    assert exc_info.value.retryable is False


def test_missing_api_key_raises():
    with pytest.raises(ValueError):
        FluxaPay(api_key="")


def test_sync_context_manager_closes_client():
    client = FluxaPay(api_key=API_KEY)
    with patch.object(client, "close") as close:
        with client as entered:
            assert entered is client
    close.assert_called_once_with()


# ── Async client ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@respx.mock
async def test_async_payments_create():
    respx.post(f"{BASE}/api/payments").mock(return_value=httpx.Response(200, json=PAYMENT_FIXTURE))
    async with AsyncFluxaPay(api_key=API_KEY) as client:
        payment = await client.payments.create(amount=49.99, currency="USD", customer_email="buyer@example.com")
    assert payment.id == "pay_123"


@pytest.mark.asyncio
@respx.mock
async def test_async_invoices_create_get_list_and_update_status():
    respx.post(f"{BASE}/api/v1/invoices").mock(
        return_value=httpx.Response(201, json={"data": INVOICE_FIXTURE})
    )
    respx.get(f"{BASE}/api/v1/invoices/inv_123").mock(
        return_value=httpx.Response(200, json={"data": INVOICE_FIXTURE})
    )
    respx.get(f"{BASE}/api/v1/invoices").mock(
        return_value=httpx.Response(200, json={"data": {"invoices": [INVOICE_FIXTURE], "total": 1}})
    )
    respx.patch(f"{BASE}/api/v1/invoices/inv_123/status").mock(
        return_value=httpx.Response(200, json={"data": INVOICE_FIXTURE})
    )
    async with AsyncFluxaPay(api_key=API_KEY) as client:
        created = await client.invoices.create(
            amount=75.0, currency="USDC", customer_email="buyer@example.com",
        )
        fetched = await client.invoices.get("inv_123")
        listed = await client.invoices.list(page=1, limit=10)
        updated = await client.invoices.update_status("inv_123", "paid")

    assert created.id == fetched.id == "inv_123"
    assert listed["data"]["total"] == 1
    assert updated.status == "draft"


@pytest.mark.asyncio
@respx.mock
async def test_async_refunds_create_get_and_list():
    respx.post(f"{BASE}/api/v1/refunds").mock(
        return_value=httpx.Response(201, json=REFUND_FIXTURE)
    )
    respx.get(f"{BASE}/api/v1/refunds/ref_123").mock(
        return_value=httpx.Response(200, json=REFUND_FIXTURE)
    )
    respx.get(f"{BASE}/api/v1/refunds").mock(
        return_value=httpx.Response(200, json={"refunds": [REFUND_FIXTURE], "total": 1})
    )
    async with AsyncFluxaPay(api_key=API_KEY) as client:
        created = await client.refunds.create(payment_id="pay_123", amount=25.0)
        fetched = await client.refunds.get("ref_123")
        listed = await client.refunds.list(status="pending")

    assert created["id"] == fetched["id"] == "ref_123"
    assert listed["total"] == 1


@pytest.mark.asyncio
@respx.mock
async def test_async_settlements_get():
    payload = {"id": "settle_1", "amount": 100.0}
    respx.get(f"{BASE}/api/settlements/settle_1").mock(return_value=httpx.Response(200, json=payload))
    async with AsyncFluxaPay(api_key=API_KEY) as client:
        result = await client.settlements.get("settle_1")
    assert result["id"] == "settle_1"


# ── Webhook verification ──────────────────────────────────────────────────────


def _make_sig(body: str, ts: str, secret: str) -> str:
    signing = f"{ts}.{body}".encode()
    return hmac.new(secret.encode(), signing, hashlib.sha256).hexdigest()


def test_verify_webhook_valid():
    body = json.dumps({"event": "payment.confirmed"})
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    secret = "whsec_test"
    sig = _make_sig(body, ts, secret)
    assert verify_webhook_signature(body, sig, ts, secret) is True


def test_verify_webhook_bad_signature():
    body = json.dumps({"event": "payment.confirmed"})
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    assert verify_webhook_signature(body, "badsig", ts, "whsec_test") is False


def test_verify_webhook_expired():
    body = json.dumps({"event": "payment.confirmed"})
    old_ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 600))
    secret = "whsec_test"
    sig = _make_sig(body, old_ts, secret)
    assert verify_webhook_signature(body, sig, old_ts, secret, tolerance_seconds=300) is False


# ── Async context manager behavior ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_async_context_manager_closes_client():
    """__aexit__ must close the httpx.AsyncClient connection pool."""
    client = AsyncFluxaPay(api_key=API_KEY)
    assert client._http.is_closed is False

    async with client as entered:
        assert entered is client
        assert client._http.is_closed is False

    # After exiting the context manager, the connection pool must be closed.
    assert client._http.is_closed is True


@pytest.mark.asyncio
async def test_async_context_manager_closes_on_exception():
    """The connection pool must be closed even if an exception is raised inside the block."""
    client = AsyncFluxaPay(api_key=API_KEY)

    with pytest.raises(RuntimeError, match="boom"):
        async with client:
            raise RuntimeError("boom")

    assert client._http.is_closed is True


@pytest.mark.asyncio
@respx.mock
async def test_async_context_manager_closes_on_api_error():
    """The connection pool must be closed even when a FluxaPayError is raised."""
    respx.post(f"{BASE}/api/payments").mock(
        return_value=httpx.Response(401, json={"message": "Unauthorized"})
    )
    client = AsyncFluxaPay(api_key=API_KEY)

    with pytest.raises(FluxaPayError):
        async with client:
            await client.payments.create(amount=1, currency="USD", customer_email="x@x.com")

    assert client._http.is_closed is True


@pytest.mark.asyncio
@respx.mock
async def test_async_context_manager_re_entry():
    """A client instance can be re-used across multiple async with blocks.

    After the first context exits and closes the connection pool, re-entering
    via a second ``async with`` must re-create the httpx.AsyncClient so the
    client is usable again.
    """
    respx.post(f"{BASE}/api/payments").mock(return_value=httpx.Response(200, json=PAYMENT_FIXTURE))

    client = AsyncFluxaPay(api_key=API_KEY)

    # First usage
    async with client:
        payment1 = await client.payments.create(
            amount=49.99, currency="USD", customer_email="buyer@example.com",
        )
        assert payment1.id == "pay_123"

    # Connection pool is closed after first exit
    assert client._http.is_closed is True

    # Re-enter — __aenter__ must re-create the httpx.AsyncClient
    async with client:
        assert client._http.is_closed is False
        payment2 = await client.payments.create(
            amount=49.99, currency="USD", customer_email="buyer@example.com",
        )
        assert payment2.id == "pay_123"

    # Connection pool is closed again
    assert client._http.is_closed is True


@pytest.mark.asyncio
async def test_async_aclose_closes_connection_pool():
    """aclose() must close the underlying httpx.AsyncClient."""
    client = AsyncFluxaPay(api_key=API_KEY)
    assert client._http.is_closed is False

    await client.aclose()

    assert client._http.is_closed is True


@pytest.mark.asyncio
async def test_async_aclose_idempotent():
    """Calling aclose() multiple times should not raise."""
    client = AsyncFluxaPay(api_key=API_KEY)
    await client.aclose()
    # Second call should not raise
    await client.aclose()
    assert client._http.is_closed is True


@pytest.mark.asyncio
async def test_async_context_manager_returns_self():
    """__aenter__ must return the client instance itself."""
    client = AsyncFluxaPay(api_key=API_KEY)
    async with client as entered:
        assert entered is client
    await client.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_async_context_manager_full_lifecycle():
    """Full lifecycle: create → poll status → exit → verify pool closed.

    This mirrors the merchant checkout flow: create a payment, poll its
    status, then exit the context manager and verify the pool was released.
    """
    respx.post(f"{BASE}/api/payments").mock(return_value=httpx.Response(200, json=PAYMENT_FIXTURE))
    respx.get(f"{BASE}/api/payments/pay_123").mock(return_value=httpx.Response(200, json=PAYMENT_FIXTURE))

    async with AsyncFluxaPay(api_key=API_KEY) as client:
        # Create
        payment = await client.payments.create(
            amount=49.99, currency="USD", customer_email="buyer@example.com",
        )
        assert payment.id == "pay_123"

        # Poll status
        status = await client.payments.get_status(payment.id)
        assert status.status == "pending"

        # Fetch full payment
        fetched = await client.payments.get(payment.id)
        assert fetched.id == "pay_123"

    # After exiting, the connection pool must be released
    assert client._http.is_closed is True


@pytest.mark.asyncio
async def test_async_context_manager_multiple_clients():
    """Multiple AsyncFluxaPay instances can be used concurrently without
    interfering with each other's connection pools."""
    client_a = AsyncFluxaPay(api_key=API_KEY)
    client_b = AsyncFluxaPay(api_key=API_KEY)

    async with client_a, client_b:
        assert client_a._http.is_closed is False
        assert client_b._http.is_closed is False

    assert client_a._http.is_closed is True
    assert client_b._http.is_closed is True
