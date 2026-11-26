"""Endpoint-by-endpoint contract tests against a mocked API (#1267).

Every SDK operation is exercised for its success response and for 400, 401,
404 and 500 errors, sync and async, and every outgoing request is checked
for the API key and SDK headers.
"""

import json

import httpx
import pytest

from fluxapay import FluxaPayError, Invoice, PaymentResponse, RefundResponse

from . import fixtures as fx

# (name, method, path, success body, sync call, async call, check)
OPERATIONS = [
    (
        "payments.create", "POST", "/api/payments", fx.PAYMENT,
        lambda c: c.payments.create(amount=49.99, currency="USD", customer_email="buyer@example.com", order_id="o1"),
        lambda c: c.payments.create(amount=49.99, currency="USD", customer_email="buyer@example.com", order_id="o1"),
        lambda r: isinstance(r, PaymentResponse) and r.id == "pay_123",
    ),
    (
        "payments.get", "GET", "/api/payments/pay_123", fx.PAYMENT,
        lambda c: c.payments.get("pay_123"),
        lambda c: c.payments.get("pay_123"),
        lambda r: r.id == "pay_123" and r.status == "pending",
    ),
    (
        "payments.get_status", "GET", "/api/payments/pay_123", fx.PAYMENT,
        lambda c: c.payments.get_status("pay_123"),
        lambda c: c.payments.get_status("pay_123"),
        lambda r: r.status == "pending",
    ),
    (
        "payments.list", "GET", "/api/payments", fx.PAYMENT_LIST,
        lambda c: c.payments.list(page=1, limit=20, status="pending"),
        lambda c: c.payments.list(page=1, limit=20, status="pending"),
        lambda r: r["data"][0]["id"] == "pay_123",
    ),
    (
        "refunds.create", "POST", "/api/v1/refunds", {"data": fx.REFUND},
        lambda c: c.refunds.create(payment_id="pay_123", amount=25.0, reason="dup", idempotency_key="idem-1"),
        lambda c: c.refunds.create(payment_id="pay_123", amount=25.0, reason="dup", idempotency_key="idem-1"),
        lambda r: isinstance(r, RefundResponse) and r.id == "ref_123",
    ),
    (
        "refunds.get", "GET", "/api/v1/refunds/ref_123", {"data": fx.REFUND},
        lambda c: c.refunds.get("ref_123"),
        lambda c: c.refunds.get("ref_123"),
        lambda r: r.payment_id == "pay_123",
    ),
    (
        "refunds.list", "GET", "/api/v1/refunds", fx.REFUND_LIST,
        lambda c: c.refunds.list(payment_id="pay_123"),
        lambda c: c.refunds.list(payment_id="pay_123"),
        lambda r: r["data"][0]["id"] == "ref_123",
    ),
    (
        "invoices.create", "POST", "/api/v1/invoices", {"data": fx.INVOICE},
        lambda c: c.invoices.create(amount=75.0, currency="USDC", customer_email="buyer@example.com"),
        lambda c: c.invoices.create(amount=75.0, currency="USDC", customer_email="buyer@example.com"),
        lambda r: isinstance(r, Invoice) and r.id == "inv_123",
    ),
    (
        "invoices.get", "GET", "/api/v1/invoices/inv_123", {"data": fx.INVOICE},
        lambda c: c.invoices.get("inv_123"),
        lambda c: c.invoices.get("inv_123"),
        lambda r: r.status == "draft",
    ),
    (
        "invoices.list", "GET", "/api/v1/invoices", fx.INVOICE_LIST,
        lambda c: c.invoices.list(),
        lambda c: c.invoices.list(),
        lambda r: r["data"][0]["id"] == "inv_123",
    ),
    (
        "invoices.update_status", "PATCH", "/api/v1/invoices/inv_123/status", {"data": {**fx.INVOICE, "status": "sent"}},
        lambda c: c.invoices.update_status("inv_123", "sent"),
        lambda c: c.invoices.update_status("inv_123", "sent"),
        lambda r: r.status == "sent",
    ),
    (
        "settlements.list", "GET", "/api/settlements", fx.SETTLEMENT_LIST,
        lambda c: c.settlements.list(),
        lambda c: c.settlements.list(),
        lambda r: r["data"][0]["id"] == "set_123",
    ),
    (
        "settlements.get", "GET", "/api/settlements/set_123", fx.SETTLEMENT,
        lambda c: c.settlements.get("set_123"),
        lambda c: c.settlements.get("set_123"),
        lambda r: r["id"] == "set_123",
    ),
    (
        "settlements.summary", "GET", "/api/settlements/summary", fx.SETTLEMENT_SUMMARY,
        lambda c: c.settlements.summary(),
        lambda c: c.settlements.summary(),
        lambda r: r["total_settled"] == 1000.0,
    ),
]

IDS = [op[0] for op in OPERATIONS]


def _route(mock_api, method, path, **kwargs):
    return mock_api.route(method=method, path=path).mock(**kwargs)


def _assert_sdk_headers(request: httpx.Request) -> None:
    assert request.headers["Authorization"] == f"Bearer {fx.API_KEY}"
    assert request.headers["X-API-Version"] == "v1"
    assert request.headers["Content-Type"] == "application/json"


# ── 200 OK ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("name,method,path,body,call,_acall,check", OPERATIONS, ids=IDS)
def test_success_sync(mock_api, client, name, method, path, body, call, _acall, check):
    route = _route(mock_api, method, path, return_value=httpx.Response(200, json=body))
    assert check(call(client))
    assert route.call_count == 1
    _assert_sdk_headers(route.calls.last.request)


@pytest.mark.parametrize("name,method,path,body,_call,acall,check", OPERATIONS, ids=IDS)
async def test_success_async(mock_api, async_client, name, method, path, body, _call, acall, check):
    route = _route(mock_api, method, path, return_value=httpx.Response(200, json=body))
    assert check(await acall(async_client))
    _assert_sdk_headers(route.calls.last.request)


# ── 400 / 401 / 404 / 500 ────────────────────────────────────────────────────


@pytest.mark.parametrize("status", [400, 401, 404, 500])
@pytest.mark.parametrize("name,method,path,body,call,_acall,_check", OPERATIONS, ids=IDS)
def test_errors_sync(mock_api, client, status, name, method, path, body, call, _acall, _check):
    _route(
        mock_api, method, path,
        return_value=httpx.Response(status, json=fx.ERRORS[status], headers={"X-Request-ID": f"req_{status}"}),
    )
    with pytest.raises(FluxaPayError) as exc:
        call(client)
    err = exc.value
    assert err.status_code == status
    assert err.message == fx.ERRORS[status]["message"]
    assert err.code == fx.ERRORS[status]["code"]
    assert err.request_id == f"req_{status}"
    assert err.raw == fx.ERRORS[status]
    assert err.retryable is False  # 400/401/404/500 are not transient
    assert str(err) == fx.ERRORS[status]["message"]


@pytest.mark.parametrize("status", [400, 401, 404, 500])
@pytest.mark.parametrize("name,method,path,body,_call,acall,_check", OPERATIONS, ids=IDS)
async def test_errors_async(mock_api, async_client, status, name, method, path, body, _call, acall, _check):
    _route(mock_api, method, path, return_value=httpx.Response(status, json=fx.ERRORS[status]))
    with pytest.raises(FluxaPayError) as exc:
        await acall(async_client)
    assert exc.value.status_code == status
    assert exc.value.code == fx.ERRORS[status]["code"]


# ── error edge cases ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("status", [429, 502, 503, 504])
def test_transient_statuses_are_marked_retryable(mock_api, client, status):
    _route(mock_api, "GET", "/api/payments/pay_123", return_value=httpx.Response(status, json={"message": "busy"}))
    with pytest.raises(FluxaPayError) as exc:
        client.payments.get("pay_123")
    assert exc.value.retryable is True


def test_non_json_error_body_still_raises_fluxapay_error(mock_api, client):
    _route(mock_api, "GET", "/api/payments/pay_123", return_value=httpx.Response(502, text="<html>Bad gateway</html>"))
    with pytest.raises(FluxaPayError) as exc:
        client.payments.get("pay_123")
    assert exc.value.status_code == 502
    assert exc.value.message == "HTTP 502"
    assert exc.value.raw is None and exc.value.code is None


def test_error_without_message_uses_the_status(mock_api, client):
    _route(mock_api, "GET", "/api/payments/pay_123", return_value=httpx.Response(404, json={}))
    with pytest.raises(FluxaPayError) as exc:
        client.payments.get("pay_123")
    assert exc.value.message == "HTTP 404"


def test_fluxapay_error_is_an_exception_subclass():
    err = FluxaPayError(status_code=401, message="nope", code="UNAUTHORIZED")
    assert isinstance(err, Exception)
    assert (err.status_code, err.code, err.request_id, err.raw) == (401, "UNAUTHORIZED", None, None)


def test_network_errors_propagate_as_httpx_errors(mock_api, client):
    _route(mock_api, "GET", "/api/payments/pay_123", side_effect=httpx.ConnectError("refused"))
    with pytest.raises(httpx.ConnectError):
        client.payments.get("pay_123")


# ── outgoing requests ────────────────────────────────────────────────────────


def test_request_bodies_and_query_params(mock_api, client):
    create = _route(mock_api, "POST", "/api/payments", return_value=httpx.Response(200, json=fx.PAYMENT))
    client.payments.create(amount=49.99, currency="USD", customer_email="buyer@example.com", metadata={"k": "v"})
    sent = json.loads(create.calls.last.request.content)
    assert sent == {"amount": 49.99, "currency": "USD", "customer_email": "buyer@example.com", "metadata": {"k": "v"}}

    refund = _route(mock_api, "POST", "/api/v1/refunds", return_value=httpx.Response(200, json={"data": fx.REFUND}))
    client.refunds.create(payment_id="pay_123", amount=25.0, idempotency_key="idem-1")
    assert json.loads(refund.calls.last.request.content)["idempotency_key"] == "idem-1"

    listed = _route(mock_api, "GET", "/api/payments", return_value=httpx.Response(200, json=fx.PAYMENT_LIST))
    client.payments.list(page=2, limit=5, status="paid")
    assert dict(listed.calls.last.request.url.params) == {"page": "2", "limit": "5", "status": "paid"}


def test_each_client_sends_its_own_api_key(mock_api):
    from fluxapay import FluxaPay

    route = _route(mock_api, "GET", "/api/payments/pay_123", return_value=httpx.Response(200, json=fx.PAYMENT))
    for key in ("sk_live_a", "sk_live_b"):
        with FluxaPay(api_key=key, base_url=fx.BASE_URL) as c:
            c.payments.get("pay_123")
        assert route.calls.last.request.headers["Authorization"] == f"Bearer {key}"


def test_custom_base_url_is_used(client):
    import respx

    from fluxapay import FluxaPay

    with respx.mock(base_url="https://sandbox.fluxapay.test") as router:
        route = router.get("/api/payments/pay_123").mock(return_value=httpx.Response(200, json=fx.PAYMENT))
        with FluxaPay(api_key=fx.API_KEY, base_url="https://sandbox.fluxapay.test/") as c:
            c.payments.get("pay_123")
        assert route.called
        _assert_sdk_headers(route.calls.last.request)


# ── webhooks ─────────────────────────────────────────────────────────────────


def test_webhooks_verify_and_parse_round_trip(client):
    import hashlib
    import hmac
    import time

    secret = "whsec_test"
    body = json.dumps(fx.WEBHOOK_PAYMENT_CONFIRMED)
    # X-FluxaPay-Timestamp is ISO 8601.
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    sig = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()

    assert client.webhooks.verify(raw_body=body, signature=sig, secret=secret, timestamp=ts) is True
    assert client.webhooks.verify(raw_body=body, signature="0" * 64, secret=secret, timestamp=ts) is False
    event = client.webhooks.parse(body)
    assert type(event).__name__ == "PaymentConfirmedEvent"
    assert (event.payment_id, event.merchant_id, event.data["transaction_hash"]) == ("pay_123", "m_1", "abc123")

    with pytest.raises(ValueError, match="Unknown event type"):
        client.webhooks.parse(json.dumps({"event": "payment.unknown"}))
