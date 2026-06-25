"""Tests for the FluxaPay Python SDK."""

import json
import hashlib
import hmac
import time
import pytest
import httpx
import respx

from fluxapay import (
    FluxaPay,
    AsyncFluxaPay,
    FluxaPayError,
    Payment,
    PaymentStatus,
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
def test_raises_fluxapay_error_on_4xx():
    respx.post(f"{BASE}/api/payments").mock(
        return_value=httpx.Response(401, json={"message": "Unauthorized"})
    )
    client = FluxaPay(api_key=API_KEY)
    with pytest.raises(FluxaPayError) as exc_info:
        client.payments.create(amount=1, currency="USD", customer_email="x@x.com")
    assert exc_info.value.status_code == 401


def test_missing_api_key_raises():
    with pytest.raises(ValueError):
        FluxaPay(api_key="")


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
