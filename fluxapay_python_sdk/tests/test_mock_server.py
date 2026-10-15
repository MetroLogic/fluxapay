"""Endpoint and error-handling tests against a respx mock of the FluxaPay API.

Covers merchants, payments, payment links, refunds and webhooks for both the
sync and async clients, and checks every status-code family maps to the right
exception class.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from typing import Any, Callable, Dict, List, Tuple

import httpx
import pytest
import respx

from conftest import (
    API_KEY,
    BASE_URL,
    ERROR_BODIES,
    MERCHANT_RESPONSE,
    PAYMENT,
    PAYMENT_LINK,
    PAYMENT_LINK_LIST,
    PAYMENT_LIST,
    REFUND,
    REFUND_LIST,
    REQUEST_ID,
    WEBHOOK_UPDATE_RESPONSE,
    fixture,
)
from fluxapay import (
    AsyncFluxaPay,
    AuthenticationError,
    BadRequestError,
    ConflictError,
    FluxaPay,
    FluxaPayError,
    NotFoundError,
    Payment,
    PaymentConfirmedEvent,
    PaymentStatus,
    PermissionDeniedError,
    RateLimitError,
    ServerError,
    verify_webhook_signature,
)


def body_of(route: respx.Route) -> Dict[str, Any]:
    return json.loads(route.calls.last.request.content)


# ── Request headers ──────────────────────────────────────────────────────────


def test_sends_api_key_and_standard_headers(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    route = mock_api.get("/api/payments/pay_123").mock(return_value=httpx.Response(200, json=fixture(PAYMENT)))

    client.payments.get("pay_123")

    headers = route.calls.last.request.headers
    assert headers["Authorization"] == f"Bearer {API_KEY}"
    assert headers["X-API-Version"] == "v1"
    assert headers["Content-Type"] == "application/json"


def test_sends_custom_headers_on_every_request(mock_api: respx.MockRouter) -> None:
    get_route = mock_api.get("/api/v1/merchants/me").mock(return_value=httpx.Response(200, json=fixture(MERCHANT_RESPONSE)))
    post_route = mock_api.post("/api/v1/payment-links").mock(return_value=httpx.Response(201, json=fixture(PAYMENT_LINK)))

    with FluxaPay(
        api_key=API_KEY,
        base_url=BASE_URL,
        headers={"X-Client-Name": "acme-shop", "X-Trace-Id": "trace-1"},
    ) as c:
        c.merchants.me()
        c.payment_links.create(title="Pro plan", currency="USD")

    for route in (get_route, post_route):
        headers = route.calls.last.request.headers
        assert headers["X-Client-Name"] == "acme-shop"
        assert headers["X-Trace-Id"] == "trace-1"
        assert headers["Authorization"] == f"Bearer {API_KEY}"


def test_custom_headers_cannot_override_authorization(mock_api: respx.MockRouter) -> None:
    route = mock_api.get("/api/v1/merchants/me").mock(return_value=httpx.Response(200, json=fixture(MERCHANT_RESPONSE)))

    with FluxaPay(api_key=API_KEY, base_url=BASE_URL, headers={"authorization": "Bearer stolen"}) as c:
        c.merchants.me()

    assert route.calls.last.request.headers["Authorization"] == f"Bearer {API_KEY}"


def test_base_url_trailing_slash_is_normalised(mock_api: respx.MockRouter) -> None:
    route = mock_api.get("/api/v1/merchants/me").mock(return_value=httpx.Response(200, json=fixture(MERCHANT_RESPONSE)))
    with FluxaPay(api_key=API_KEY, base_url=BASE_URL + "/") as c:
        c.merchants.me()
    assert route.called


def test_missing_api_key_raises_value_error() -> None:
    with pytest.raises(ValueError):
        FluxaPay(api_key="")
    with pytest.raises(ValueError):
        AsyncFluxaPay(api_key="")


# ── Merchants ────────────────────────────────────────────────────────────────


def test_merchants_me(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/v1/merchants/me").mock(return_value=httpx.Response(200, json=fixture(MERCHANT_RESPONSE)))

    merchant = client.merchants.me()

    assert merchant["id"] == "cm3merchant0001"
    assert merchant["business_name"] == "Example Shop"
    assert "api_key_hashed" not in merchant


def test_merchants_update_webhook(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    route = mock_api.patch("/api/v1/merchants/me/webhook").mock(
        return_value=httpx.Response(200, json=fixture(WEBHOOK_UPDATE_RESPONSE))
    )

    result = client.merchants.update_webhook("https://shop.example.com/new-hook")

    assert result["webhook_url"] == "https://shop.example.com/new-hook"
    assert body_of(route) == {"webhook_url": "https://shop.example.com/new-hook"}


# ── Payments ─────────────────────────────────────────────────────────────────


def test_payments_create_sends_only_provided_fields(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    route = mock_api.post("/api/payments").mock(return_value=httpx.Response(201, json=fixture(PAYMENT)))

    payment = client.payments.create(
        amount=120.5,
        currency="USDC",
        customer_email="buyer@example.com",
        success_url="https://shop.example.com/thanks",
        metadata={"order_id": "ord_1234"},
    )

    assert isinstance(payment, Payment)
    assert payment.id == "pay_123"
    assert payment.checkout_url.endswith("/pay/pay_123")
    assert payment.metadata == {"order_id": "ord_1234"}
    assert body_of(route) == {
        "amount": 120.5,
        "currency": "USDC",
        "customer_email": "buyer@example.com",
        "success_url": "https://shop.example.com/thanks",
        "metadata": {"order_id": "ord_1234"},
    }


def test_payments_get_ignores_unknown_fields(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    payload = fixture(PAYMENT)
    payload["usdc_amount"] = "120.5"  # extra backend fields must not break the dataclass
    mock_api.get("/api/payments/pay_123").mock(return_value=httpx.Response(200, json=payload))

    payment = client.payments.get("pay_123")

    assert payment.id == "pay_123"
    assert payment.status == "pending"


def test_payments_get_status(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    payload = {**fixture(PAYMENT), "status": "confirmed", "transaction_hash": "abc123"}
    mock_api.get("/api/payments/pay_123").mock(return_value=httpx.Response(200, json=payload))

    status = client.payments.get_status("pay_123")

    assert isinstance(status, PaymentStatus)
    assert status.status == "confirmed"
    assert status.transaction_hash == "abc123"


def test_payments_list_passes_filters(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    route = mock_api.get("/api/payments").mock(return_value=httpx.Response(200, json=fixture(PAYMENT_LIST)))

    result = client.payments.list(page=2, limit=10, status="pending")

    assert result["total"] == 1
    params = route.calls.last.request.url.params
    assert params["page"] == "2" and params["limit"] == "10" and params["status"] == "pending"


# ── Payment links ────────────────────────────────────────────────────────────


def test_payment_links_create(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    route = mock_api.post("/api/v1/payment-links").mock(return_value=httpx.Response(201, json=fixture(PAYMENT_LINK)))

    link = client.payment_links.create(
        title="Pro plan - monthly",
        currency="USD",
        amount=25,
        metadata={"plan": "pro"},
    )

    assert link["short_url"] == "https://pay.fluxapay.com/pay/k3j9x2ab"
    assert body_of(route) == {
        "title": "Pro plan - monthly",
        "currency": "USD",
        "amount": 25,
        "metadata": {"plan": "pro"},
    }


def test_payment_links_create_open_amount_omits_amount(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    route = mock_api.post("/api/v1/payment-links").mock(
        return_value=httpx.Response(201, json={**fixture(PAYMENT_LINK), "amount": None})
    )

    link = client.payment_links.create(title="Tip jar", currency="USD")

    assert link["amount"] is None
    assert "amount" not in body_of(route)


def test_payment_links_get_list_update_delete(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/v1/payment-links/cm4link000001").mock(return_value=httpx.Response(200, json=fixture(PAYMENT_LINK)))
    list_route = mock_api.get("/api/v1/payment-links").mock(return_value=httpx.Response(200, json=fixture(PAYMENT_LINK_LIST)))
    update_route = mock_api.patch("/api/v1/payment-links/cm4link000001").mock(
        return_value=httpx.Response(200, json={**fixture(PAYMENT_LINK), "active": False})
    )
    delete_route = mock_api.delete("/api/v1/payment-links/cm4link000001").mock(return_value=httpx.Response(204))

    assert client.payment_links.get("cm4link000001")["slug"] == "k3j9x2ab"

    listed = client.payment_links.list(page=1, limit=20, active=True)
    assert listed["meta"]["total"] == 1
    params = list_route.calls.last.request.url.params
    assert params["active"] == "true" and params["page"] == "1" and params["limit"] == "20"

    updated = client.payment_links.update("cm4link000001", active=False, title="Paused")
    assert updated["active"] is False
    assert body_of(update_route) == {"title": "Paused", "active": False}

    assert client.payment_links.delete("cm4link000001") is None
    assert delete_route.called


# ── Refunds ──────────────────────────────────────────────────────────────────


def test_refunds_create_sends_idempotency_key(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    route = mock_api.post("/api/v1/refunds").mock(return_value=httpx.Response(201, json={"data": fixture(REFUND)}))

    result = client.refunds.create(payment_id="pay_123", amount=25.0, reason="Duplicate", idempotency_key="refund-1")

    assert result["data"]["id"] == "ref_123"
    request = route.calls.last.request
    assert request.headers["Idempotency-Key"] == "refund-1"
    assert body_of(route)["payment_id"] == "pay_123"


def test_refunds_create_without_idempotency_key_sends_no_header(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    route = mock_api.post("/api/v1/refunds").mock(return_value=httpx.Response(201, json={"data": fixture(REFUND)}))

    client.refunds.create(payment_id="pay_123", amount=25.0)

    assert "Idempotency-Key" not in route.calls.last.request.headers


def test_refunds_get_and_list(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/v1/refunds/ref_123").mock(return_value=httpx.Response(200, json={"data": fixture(REFUND)}))
    list_route = mock_api.get("/api/v1/refunds").mock(return_value=httpx.Response(200, json=fixture(REFUND_LIST)))

    assert client.refunds.get("ref_123")["data"]["status"] == "pending"
    listed = client.refunds.list(status="pending", payment_id="pay_123")
    assert listed["data"]["pagination"]["total"] == 1
    params = list_route.calls.last.request.url.params
    assert params["status"] == "pending" and params["payment_id"] == "pay_123"


# ── Error handling matrix ────────────────────────────────────────────────────

# (name, HTTP method, path, call)
Endpoint = Tuple[str, str, str, Callable[[FluxaPay], Any]]

ENDPOINTS: List[Endpoint] = [
    ("merchants.me", "GET", "/api/v1/merchants/me", lambda c: c.merchants.me()),
    ("merchants.update_webhook", "PATCH", "/api/v1/merchants/me/webhook", lambda c: c.merchants.update_webhook("https://x.test")),
    ("payments.create", "POST", "/api/payments", lambda c: c.payments.create(amount=1, currency="USDC", customer_email="a@b.co")),
    ("payments.get", "GET", "/api/payments/pay_123", lambda c: c.payments.get("pay_123")),
    ("payments.list", "GET", "/api/payments", lambda c: c.payments.list()),
    ("payment_links.create", "POST", "/api/v1/payment-links", lambda c: c.payment_links.create(title="t", currency="USD")),
    ("payment_links.get", "GET", "/api/v1/payment-links/cm4link000001", lambda c: c.payment_links.get("cm4link000001")),
    ("payment_links.delete", "DELETE", "/api/v1/payment-links/cm4link000001", lambda c: c.payment_links.delete("cm4link000001")),
    ("refunds.create", "POST", "/api/v1/refunds", lambda c: c.refunds.create(payment_id="pay_123", amount=1)),
    ("refunds.get", "GET", "/api/v1/refunds/ref_123", lambda c: c.refunds.get("ref_123")),
]

STATUS_TO_ERROR = [
    (400, BadRequestError),
    (401, AuthenticationError),
    (404, NotFoundError),
    (500, ServerError),
]


@pytest.mark.parametrize("status,error_cls", STATUS_TO_ERROR, ids=[str(s) for s, _ in STATUS_TO_ERROR])
@pytest.mark.parametrize("name,method,path,call", ENDPOINTS, ids=[e[0] for e in ENDPOINTS])
def test_error_responses_raise_typed_exceptions(
    mock_api: respx.MockRouter,
    client: FluxaPay,
    name: str,
    method: str,
    path: str,
    call: Callable[[FluxaPay], Any],
    status: int,
    error_cls: type,
) -> None:
    body = ERROR_BODIES[status]
    getattr(mock_api, method.lower())(path).mock(
        return_value=httpx.Response(status, json=body, headers={"X-FluxaPay-Request-ID": REQUEST_ID})
    )

    with pytest.raises(error_cls) as exc_info:
        call(client)

    err = exc_info.value
    assert isinstance(err, FluxaPayError)
    assert err.status_code == status
    assert err.code == body["code"]
    assert err.message == body["message"]
    assert str(err) == body["message"]
    assert err.request_id == REQUEST_ID
    assert err.raw == body
    assert err.retryable is False


def test_validation_error_exposes_field_errors(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.post("/api/payments").mock(return_value=httpx.Response(400, json=ERROR_BODIES[400]))

    with pytest.raises(BadRequestError) as exc_info:
        client.payments.create(amount=0, currency="USDC", customer_email="a@b.co")

    assert exc_info.value.errors == [{"field": "amount", "message": "Amount must be greater than 0"}]


@pytest.mark.parametrize(
    "status,error_cls",
    [(403, PermissionDeniedError), (410, ConflictError), (422, ConflictError), (418, FluxaPayError)],
)
def test_other_status_codes_map_to_expected_classes(
    mock_api: respx.MockRouter, client: FluxaPay, status: int, error_cls: type
) -> None:
    mock_api.get("/api/v1/payment-links/cm4link000001").mock(
        return_value=httpx.Response(status, json={"code": "SOME_CODE", "message": "nope"})
    )
    with pytest.raises(error_cls) as exc_info:
        client.payment_links.get("cm4link000001")
    assert type(exc_info.value) is error_cls


def test_permission_denied_keeps_details_in_raw(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.post("/api/payments").mock(return_value=httpx.Response(403, json=ERROR_BODIES[403]))

    with pytest.raises(PermissionDeniedError) as exc_info:
        client.payments.create(amount=1, currency="USDC", customer_email="a@b.co")

    assert exc_info.value.code == "KYC_REQUIRED"
    assert exc_info.value.raw["details"]["kyc_status"] == "pending_review"


def test_rate_limit_error_parses_retry_after_seconds(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/payments/pay_123").mock(
        return_value=httpx.Response(429, json=ERROR_BODIES[429], headers={"Retry-After": "30"})
    )

    with pytest.raises(RateLimitError) as exc_info:
        client.payments.get("pay_123")

    err = exc_info.value
    assert err.retryable is True
    assert err.retry_after == 30.0
    assert err.code == "RATE_LIMIT_EXCEEDED"


def test_rate_limit_error_parses_retry_after_http_date(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    retry_at = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=60), usegmt=True)
    mock_api.get("/api/payments/pay_123").mock(
        return_value=httpx.Response(429, json=ERROR_BODIES[429], headers={"Retry-After": retry_at})
    )

    with pytest.raises(RateLimitError) as exc_info:
        client.payments.get("pay_123")

    assert exc_info.value.retry_after is not None
    assert 0 < exc_info.value.retry_after <= 60


def test_rate_limit_error_without_retry_after(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/payments/pay_123").mock(return_value=httpx.Response(429, json=ERROR_BODIES[429]))
    with pytest.raises(RateLimitError) as exc_info:
        client.payments.get("pay_123")
    assert exc_info.value.retry_after is None


def test_503_is_retryable_server_error(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/payments/pay_123").mock(return_value=httpx.Response(503, json=ERROR_BODIES[503]))
    with pytest.raises(ServerError) as exc_info:
        client.payments.get("pay_123")
    assert exc_info.value.retryable is True


def test_non_json_error_body(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/payments/pay_123").mock(
        return_value=httpx.Response(502, text="<html>Bad Gateway</html>", headers={"Content-Type": "text/html"})
    )

    with pytest.raises(ServerError) as exc_info:
        client.payments.get("pay_123")

    err = exc_info.value
    assert err.message == "HTTP 502"
    assert err.code is None
    assert err.raw is None


def test_falls_back_to_x_request_id_header(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/payments/pay_123").mock(
        return_value=httpx.Response(404, json=ERROR_BODIES[404], headers={"X-Request-ID": "req_legacy"})
    )
    with pytest.raises(NotFoundError) as exc_info:
        client.payments.get("pay_123")
    assert exc_info.value.request_id == "req_legacy"


def test_error_repr_is_informative() -> None:
    err = NotFoundError(status_code=404, message="Payment not found", code="PAYMENT_NOT_FOUND")
    assert repr(err) == "NotFoundError(status_code=404, code='PAYMENT_NOT_FOUND', message='Payment not found')"


def test_network_errors_propagate(mock_api: respx.MockRouter, client: FluxaPay) -> None:
    mock_api.get("/api/payments/pay_123").mock(side_effect=httpx.ConnectError("connection refused"))
    with pytest.raises(httpx.ConnectError):
        client.payments.get("pay_123")


# ── Webhooks ─────────────────────────────────────────────────────────────────

WEBHOOK_SECRET = "whsec_test_secret"


def _signed(payload: Dict[str, Any], ts: str) -> Tuple[str, str]:
    raw = json.dumps(payload)
    sig = hmac.new(WEBHOOK_SECRET.encode(), f"{ts}.{raw}".encode(), hashlib.sha256).hexdigest()
    return raw, sig


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


WEBHOOK_PAYLOAD: Dict[str, Any] = {
    "event": "payment_confirmed",
    "payment_id": "pay_123",
    "merchant_id": "cm3merchant0001",
    "timestamp": "2026-10-15T12:04:10.512Z",
    "data": {"amount": "120.5", "currency": "USDC", "status": "confirmed"},
}


def test_webhooks_verify_and_parse(client: FluxaPay) -> None:
    ts = _now_iso()
    raw, sig = _signed(WEBHOOK_PAYLOAD, ts)

    assert client.webhooks.verify(raw, sig, WEBHOOK_SECRET, timestamp=ts) is True
    assert verify_webhook_signature(raw, sig, ts, WEBHOOK_SECRET) is True

    event = client.webhooks.parse(raw)
    assert isinstance(event, PaymentConfirmedEvent)
    assert event.payment_id == "pay_123"
    assert event.data["status"] == "confirmed"


@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(lambda raw, sig, ts: (raw.replace("120.5", "999"), sig, ts), id="tampered-body"),
        pytest.param(lambda raw, sig, ts: (raw, "0" * 64, ts), id="wrong-signature"),
        pytest.param(lambda raw, sig, ts: (raw, sig, "2020-01-01T00:00:00Z"), id="stale-timestamp"),
        pytest.param(lambda raw, sig, ts: (raw, sig, "not-a-date"), id="bad-timestamp"),
        pytest.param(lambda raw, sig, ts: (raw, "", ts), id="missing-signature"),
    ],
)
def test_webhooks_verify_rejects(client: FluxaPay, mutate: Callable[[str, str, str], Tuple[str, str, str]]) -> None:
    ts = _now_iso()
    raw, sig = _signed(WEBHOOK_PAYLOAD, ts)
    raw, sig, ts = mutate(raw, sig, ts)
    assert client.webhooks.verify(raw, sig, WEBHOOK_SECRET, timestamp=ts) is False


def test_webhooks_parse_unknown_event(client: FluxaPay) -> None:
    with pytest.raises(ValueError):
        client.webhooks.parse(json.dumps({**WEBHOOK_PAYLOAD, "event": "something_else"}))


# ── Async client ─────────────────────────────────────────────────────────────


async def test_async_sends_custom_headers(mock_api: respx.MockRouter) -> None:
    route = mock_api.get("/api/v1/merchants/me").mock(return_value=httpx.Response(200, json=fixture(MERCHANT_RESPONSE)))

    async with AsyncFluxaPay(api_key=API_KEY, base_url=BASE_URL, headers={"X-Client-Name": "acme"}) as c:
        merchant = await c.merchants.me()

    assert merchant["business_name"] == "Example Shop"
    headers = route.calls.last.request.headers
    assert headers["Authorization"] == f"Bearer {API_KEY}"
    assert headers["X-Client-Name"] == "acme"


async def test_async_payment_links_crud(mock_api: respx.MockRouter, async_client: AsyncFluxaPay) -> None:
    mock_api.post("/api/v1/payment-links").mock(return_value=httpx.Response(201, json=fixture(PAYMENT_LINK)))
    mock_api.get("/api/v1/payment-links").mock(return_value=httpx.Response(200, json=fixture(PAYMENT_LINK_LIST)))
    mock_api.patch("/api/v1/payment-links/cm4link000001").mock(return_value=httpx.Response(200, json=fixture(PAYMENT_LINK)))
    delete_route = mock_api.delete("/api/v1/payment-links/cm4link000001").mock(return_value=httpx.Response(204))

    link = await async_client.payment_links.create(title="Pro plan", currency="USD", amount=25)
    assert link["slug"] == "k3j9x2ab"
    assert (await async_client.payment_links.list(active=False))["meta"]["total"] == 1
    assert (await async_client.payment_links.update("cm4link000001", title="x"))["id"] == "cm4link000001"
    assert await async_client.payment_links.delete("cm4link000001") is None
    assert delete_route.called


async def test_async_merchants_update_webhook(mock_api: respx.MockRouter, async_client: AsyncFluxaPay) -> None:
    route = mock_api.patch("/api/v1/merchants/me/webhook").mock(
        return_value=httpx.Response(200, json=fixture(WEBHOOK_UPDATE_RESPONSE))
    )
    result = await async_client.merchants.update_webhook("https://shop.example.com/new-hook")
    assert result["message"] == "Webhook URL updated"
    assert body_of(route) == {"webhook_url": "https://shop.example.com/new-hook"}


async def test_async_refund_idempotency_header(mock_api: respx.MockRouter, async_client: AsyncFluxaPay) -> None:
    route = mock_api.post("/api/v1/refunds").mock(return_value=httpx.Response(201, json={"data": fixture(REFUND)}))
    await async_client.refunds.create(payment_id="pay_123", amount=5, idempotency_key="async-refund-1")
    assert route.calls.last.request.headers["Idempotency-Key"] == "async-refund-1"


@pytest.mark.parametrize("status,error_cls", STATUS_TO_ERROR, ids=[str(s) for s, _ in STATUS_TO_ERROR])
async def test_async_error_responses_raise_typed_exceptions(
    mock_api: respx.MockRouter, async_client: AsyncFluxaPay, status: int, error_cls: type
) -> None:
    mock_api.get("/api/payments/pay_123").mock(
        return_value=httpx.Response(status, json=ERROR_BODIES[status], headers={"X-FluxaPay-Request-ID": REQUEST_ID})
    )

    with pytest.raises(error_cls) as exc_info:
        await async_client.payments.get("pay_123")

    assert exc_info.value.status_code == status
    assert exc_info.value.request_id == REQUEST_ID


async def test_async_rate_limit(mock_api: respx.MockRouter, async_client: AsyncFluxaPay) -> None:
    mock_api.get("/api/v1/merchants/me").mock(
        return_value=httpx.Response(429, json=ERROR_BODIES[429], headers={"Retry-After": "5"})
    )
    with pytest.raises(RateLimitError) as exc_info:
        await async_client.merchants.me()
    assert exc_info.value.retry_after == 5.0
