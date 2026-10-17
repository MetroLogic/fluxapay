"""FluxaPay Python SDK."""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union, Literal, cast

import httpx
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from . import webhooks
from .webhooks import WebhookSignatureVerificationError, verify_signature

__version__ = "0.1.0"
__all__ = [
    "FluxaPay",
    "AsyncFluxaPay",
    "FluxaPayError",
    "Payment",
    "PaymentResponse",
    "CustomerResponse",
    "PaymentLinkResponse",
    "RefundResponse",
    "PaymentStatus",
    "Invoice",
    "WebhookEvent",
    "WebhookEventBase",
    "PaymentCreatedEvent",
    "PaymentPendingEvent",
    "PaymentConfirmedEvent",
    "PaymentFailedEvent",
    "PaymentSettledEvent",
    "RefundCompletedEvent",
    "webhooks",
    "verify_signature",
    "WebhookSignatureVerificationError",
    "verify_webhook_signature",
]

_DEFAULT_BASE_URL = "https://api.fluxapay.com"
_API_VERSION = "v1"


# ── Errors ────────────────────────────────────────────────────────────────────


class FluxaPayError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        raw: Any = None,
        code: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.raw = raw
        self.code = code
        self.request_id = request_id
        self.retryable = status_code in (429, 502, 503, 504)


# ── Models ────────────────────────────────────────────────────────────────────


class ResponseModel(BaseModel):
    model_config = ConfigDict(extra="allow")

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump(mode="python")

    def __getitem__(self, key: str) -> Any:
        return self.to_dict()[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self.to_dict().get(key, default)


class CustomerResponse(ResponseModel):
    id: str
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None
    stellar_address: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    deleted_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class PaymentResponse(ResponseModel):
    id: str
    amount: Decimal
    currency: str
    status: str
    checkout_url: str
    stellar_address: Optional[str] = None
    customer_email: str
    created_at: datetime = Field(
        validation_alias=AliasChoices("created_at", "createdAt")
    )
    expires_at: datetime = Field(
        validation_alias=AliasChoices("expires_at", "expiration")
    )
    order_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    paid_amount: Optional[Decimal] = None
    usdc_amount: Optional[Decimal] = None
    fx_rate: Optional[Decimal] = None
    transaction_hash: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    settled_at: Optional[datetime] = None
    customer_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("customer_id", "customerId"),
    )
    payment_link_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("payment_link_id", "paymentLinkId"),
    )


Payment = PaymentResponse


class PaymentLinkResponse(ResponseModel):
    id: str
    slug: str
    title: str
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: str
    redirect_url: Optional[str] = None
    expiry: Optional[datetime] = None
    active: bool = True
    metadata: Optional[Dict[str, Any]] = None
    short_url: Optional[str] = None
    total_payments: int = 0
    total_volume: Decimal = Decimal("0")
    customer: Optional[CustomerResponse] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    expired: Optional[bool] = None


class RefundResponse(ResponseModel):
    id: str
    payment_id: str = Field(
        validation_alias=AliasChoices("payment_id", "paymentId")
    )
    amount: Decimal
    currency: Optional[str] = None
    reason: Optional[str] = None
    status: str
    failed_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


def _response_data(payload: Any) -> Dict[str, Any]:
    response = cast(Dict[str, Any], payload)
    data = response.get("data")
    return cast(Dict[str, Any], data) if isinstance(data, dict) else response


@dataclass
class PaymentStatus:
    id: str
    status: str
    transaction_hash: Optional[str] = None
    confirmed_at: Optional[str] = None


def _empty_line_items() -> List[Dict[str, Any]]:
    return []


@dataclass
class Invoice:
    id: str
    customer_name: Optional[str]
    customer_email: str
    currency: str
    amount: float
    status: str
    due_date: Optional[str]
    created_at: str
    updated_at: Optional[str] = None
    line_items: List[Dict[str, Any]] = field(default_factory=_empty_line_items)
    notes: Optional[str] = None


@dataclass
class WebhookEventBase:
    payment_id: str
    merchant_id: str
    timestamp: str
    data: Dict[str, Any]

@dataclass
class PaymentCreatedEvent(WebhookEventBase):
    event: Literal["payment_created"]

@dataclass
class PaymentPendingEvent(WebhookEventBase):
    event: Literal["payment_pending"]

@dataclass
class PaymentConfirmedEvent(WebhookEventBase):
    event: Literal["payment_confirmed"]

@dataclass
class PaymentFailedEvent(WebhookEventBase):
    event: Literal["payment_failed"]

@dataclass
class PaymentSettledEvent(WebhookEventBase):
    event: Literal["payment_settled"]

@dataclass
class RefundCompletedEvent(WebhookEventBase):
    event: Literal["refund_completed"]

WebhookEvent = Union[
    PaymentCreatedEvent,
    PaymentPendingEvent,
    PaymentConfirmedEvent,
    PaymentFailedEvent,
    PaymentSettledEvent,
    RefundCompletedEvent
]


# ── Webhook verification ──────────────────────────────────────────────────────


def verify_webhook_signature(
    raw_body: str,
    signature: str,
    timestamp: str,
    secret: str,
    tolerance_seconds: int = 300,
) -> bool:
    """Verify a FluxaPay webhook HMAC-SHA256 signature.

    Args:
        raw_body: Raw JSON string from the request body.
        signature: Value of the ``X-FluxaPay-Signature`` header.
        timestamp: Value of the ``X-FluxaPay-Timestamp`` header (ISO 8601).
        secret: Your webhook secret (``whsec_...``).
        tolerance_seconds: Replay-protection window in seconds (default 300).

    Returns:
        ``True`` if the signature is valid and within the tolerance window.
    """
    if not all([raw_body, signature, timestamp, secret]):
        return False

    from datetime import datetime, timezone
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S+00:00"):
        try:
            webhook_ts = datetime.strptime(timestamp, fmt).replace(tzinfo=timezone.utc).timestamp()
            break
        except ValueError:
            continue
    else:
        return False

    if abs(time.time() - webhook_ts) > tolerance_seconds:
        return False

    signing_string = f"{timestamp}.{raw_body}".encode()
    expected = hmac.new(secret.encode(), signing_string, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Internal HTTP helpers ─────────────────────────────────────────────────────


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-API-Version": _API_VERSION,
    }


def _raise_for(response: httpx.Response) -> None:
    if not response.is_success:
        try:
            body = response.json()
            message = body.get("message", f"HTTP {response.status_code}")
            code = body.get("code")
        except Exception:
            body = None
            message = f"HTTP {response.status_code}"
            code = None
        request_id = response.headers.get("x-request-id") or response.headers.get("X-Request-ID")
        raise FluxaPayError(
            status_code=response.status_code,
            message=message,
            raw=body,
            code=code,
            request_id=request_id,
        )


# ── Resource mixins (shared logic) ────────────────────────────────────────────


class _PaymentsMixin:
    _base_url: str
    _api_key: str

    def _payments_create_body(self, **kwargs: Any) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}

    def _payments_list_params(
        self,
        page: Optional[int],
        limit: Optional[int],
        status: Optional[str],
    ) -> Dict[str, Any]:
        p: Dict[str, Any] = {}
        if page is not None:
            p["page"] = page
        if limit is not None:
            p["limit"] = limit
        if status is not None:
            p["status"] = status
        return p


class _SettlementsMixin:
    _base_url: str
    _api_key: str

    def _settlements_list_params(self, **kwargs: Any) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}


class _InvoicesMixin:
    def _invoice_create_body(self, **kwargs: Any) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}

    def _invoice_list_params(self, **kwargs: Any) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}

    @staticmethod
    def _invoice_from_response(payload: Dict[str, Any]) -> Invoice:
        data = payload.get("data", payload)
        return Invoice(**{k: data[k] for k in Invoice.__dataclass_fields__ if k in data})


class _RefundsMixin:
    def _refund_create_body(self, **kwargs: Any) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}

    def _refund_list_params(self, **kwargs: Any) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}


# ── Synchronous client ────────────────────────────────────────────────────────


class FluxaPay(_PaymentsMixin, _SettlementsMixin, _InvoicesMixin, _RefundsMixin):
    """Synchronous FluxaPay API client.

    Example::

        from fluxapay import FluxaPay

        with FluxaPay(api_key="sk_live_...") as client:
            payment = client.payments.create(
                amount=49.99,
                currency="USD",
                customer_email="buyer@example.com",
            )
            print(payment.checkout_url)
    """

    def __init__(self, api_key: str, base_url: str = _DEFAULT_BASE_URL) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.Client(
            base_url=self._base_url,
            headers=_headers(api_key),
            timeout=30.0,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "FluxaPay":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        r = self._http.get(path, params=params)
        _raise_for(r)
        return cast(Dict[str, Any], r.json())

    def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        r = self._http.post(path, json=body)
        _raise_for(r)
        return cast(Dict[str, Any], r.json())

    def _patch(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        r = self._http.patch(path, json=body)
        _raise_for(r)
        return cast(Dict[str, Any], r.json())

    # ── payments ──────────────────────────────────────────────────────────────

    class _Payments:
        def __init__(self, client: "FluxaPay") -> None:
            self._c = client

        def create(
            self,
            amount: float,
            currency: str,
            customer_email: str,
            order_id: Optional[str] = None,
            success_url: Optional[str] = None,
            cancel_url: Optional[str] = None,
            metadata: Optional[Dict[str, Any]] = None,
            expires_in_minutes: Optional[int] = None,
        ) -> Payment:
            body = self._c._payments_create_body(
                amount=amount,
                currency=currency,
                customer_email=customer_email,
                order_id=order_id,
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata,
                expires_in_minutes=expires_in_minutes,
            )
            data = self._c._post("/api/payments", body)
            return Payment.model_validate(_response_data(data))

        def get(self, payment_id: str) -> Payment:
            data = self._c._get(f"/api/payments/{payment_id}")
            return Payment.model_validate(_response_data(data))

        def get_status(self, payment_id: str) -> PaymentStatus:
            data = self._c._get(f"/api/payments/{payment_id}")
            return PaymentStatus(**{k: data[k] for k in PaymentStatus.__dataclass_fields__ if k in data})

        def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            status: Optional[str] = None,
        ) -> Dict[str, Any]:
            params = self._c._payments_list_params(page, limit, status)
            return self._c._get("/api/payments", params=params)

    @property
    def payments(self) -> "_Payments":
        return self._Payments(self)

    # ── invoices ──────────────────────────────────────────────────────────────

    class _Invoices:
        def __init__(self, client: "FluxaPay") -> None:
            self._c = client

        def create(
            self,
            amount: float,
            currency: str,
            customer_email: str,
            customer_name: Optional[str] = None,
            line_items: Optional[List[Dict[str, Any]]] = None,
            notes: Optional[str] = None,
            metadata: Optional[Dict[str, Any]] = None,
            due_date: Optional[str] = None,
            tax_rate: Optional[float] = None,
        ) -> Invoice:
            body = self._c._invoice_create_body(
                amount=amount,
                currency=currency,
                customer_email=customer_email,
                customer_name=customer_name,
                line_items=line_items,
                notes=notes,
                metadata=metadata,
                due_date=due_date,
                tax_rate=tax_rate,
            )
            data = self._c._post("/api/v1/invoices", body)
            return self._c._invoice_from_response(data)

        def get(self, invoice_id: str) -> Invoice:
            data = self._c._get(f"/api/v1/invoices/{invoice_id}")
            return self._c._invoice_from_response(data)

        def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            status: Optional[str] = None,
            search: Optional[str] = None,
        ) -> Dict[str, Any]:
            params = self._c._invoice_list_params(
                page=page, limit=limit, status=status, search=search,
            )
            return self._c._get("/api/v1/invoices", params=params)

        def update_status(self, invoice_id: str, status: str) -> Invoice:
            data = self._c._patch(
                f"/api/v1/invoices/{invoice_id}/status", {"status": status},
            )
            return self._c._invoice_from_response(data)

    @property
    def invoices(self) -> "_Invoices":
        return self._Invoices(self)

    # ── refunds ───────────────────────────────────────────────────────────────

    class _Refunds:
        def __init__(self, client: "FluxaPay") -> None:
            self._c = client

        def create(
            self,
            payment_id: str,
            amount: float,
            reason: Optional[str] = None,
            idempotency_key: Optional[str] = None,
        ) -> RefundResponse:
            body = self._c._refund_create_body(
                payment_id=payment_id,
                amount=amount,
                reason=reason,
                idempotency_key=idempotency_key,
            )
            return RefundResponse.model_validate(
                _response_data(self._c._post("/api/v1/refunds", body))
            )

        def get(self, refund_id: str) -> RefundResponse:
            data = self._c._get(f"/api/v1/refunds/{refund_id}")
            return RefundResponse.model_validate(_response_data(data))

        def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            status: Optional[str] = None,
            payment_id: Optional[str] = None,
        ) -> Dict[str, Any]:
            params = self._c._refund_list_params(
                page=page, limit=limit, status=status, payment_id=payment_id,
            )
            return self._c._get("/api/v1/refunds", params=params)

    @property
    def refunds(self) -> "_Refunds":
        return self._Refunds(self)

    # ── settlements ───────────────────────────────────────────────────────────

    class _Settlements:
        def __init__(self, client: "FluxaPay") -> None:
            self._c = client

        def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            status: Optional[str] = None,
            currency: Optional[str] = None,
            date_from: Optional[str] = None,
            date_to: Optional[str] = None,
        ) -> Dict[str, Any]:
            params = self._c._settlements_list_params(
                page=page, limit=limit, status=status,
                currency=currency, date_from=date_from, date_to=date_to,
            )
            return self._c._get("/api/settlements", params=params)

        def get(self, settlement_id: str) -> Dict[str, Any]:
            return self._c._get(f"/api/settlements/{settlement_id}")

        def summary(self) -> Dict[str, Any]:
            return self._c._get("/api/settlements/summary")

    @property
    def settlements(self) -> "_Settlements":
        return self._Settlements(self)

    # ── webhooks ──────────────────────────────────────────────────────────────

    class _Webhooks:
        def verify(
            self,
            raw_body: str,
            signature: str,
            secret: str,
            timestamp: Optional[str] = None,
            tolerance_seconds: int = 300,
        ) -> bool:
            ts = timestamp or ""
            return verify_webhook_signature(raw_body, signature, ts, secret, tolerance_seconds)

        def parse(self, raw_body: str) -> WebhookEvent:
            import json
            d = json.loads(raw_body)
            event_type = d.get("event")
            classes = {
                "payment_created": PaymentCreatedEvent,
                "payment_pending": PaymentPendingEvent,
                "payment_confirmed": PaymentConfirmedEvent,
                "payment_failed": PaymentFailedEvent,
                "payment_settled": PaymentSettledEvent,
                "refund_completed": RefundCompletedEvent,
            }
            cls = classes.get(event_type)
            if not cls:
                raise ValueError(f"Unknown event type: {event_type}")
            event_fields = getattr(cls, "__dataclass_fields__")
            event_class: Any = cls
            return cast(
                WebhookEvent,
                event_class(**{k: d[k] for k in event_fields if k in d}),
            )

    @property
    def webhooks(self) -> "_Webhooks":
        return self._Webhooks()


# ── Asynchronous client ───────────────────────────────────────────────────────


class AsyncFluxaPay(_PaymentsMixin, _SettlementsMixin, _InvoicesMixin, _RefundsMixin):
    """Async FluxaPay API client (requires ``httpx`` with async support).

    Example::

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

        asyncio.run(main())
    """

    def __init__(self, api_key: str, base_url: str = _DEFAULT_BASE_URL) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers=_headers(api_key),
            timeout=30.0,
        )

    async def aclose(self) -> None:
        """Close the underlying httpx.AsyncClient and release connection pool resources."""
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncFluxaPay":
        # Support re-entry: if the client was previously closed (e.g. via a
        # prior ``async with`` block), recreate the httpx.AsyncClient so the
        # context manager can be safely reused.
        if self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=self._base_url,
                headers=_headers(self._api_key),
                timeout=30.0,
            )
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.aclose()

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        r = await self._http.get(path, params=params)
        _raise_for(r)
        return cast(Dict[str, Any], r.json())

    async def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        r = await self._http.post(path, json=body)
        _raise_for(r)
        return cast(Dict[str, Any], r.json())

    async def _patch(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        r = await self._http.patch(path, json=body)
        _raise_for(r)
        return cast(Dict[str, Any], r.json())

    # ── payments ──────────────────────────────────────────────────────────────

    class _AsyncPayments:
        def __init__(self, client: "AsyncFluxaPay") -> None:
            self._c = client

        async def create(
            self,
            amount: float,
            currency: str,
            customer_email: str,
            order_id: Optional[str] = None,
            success_url: Optional[str] = None,
            cancel_url: Optional[str] = None,
            metadata: Optional[Dict[str, Any]] = None,
            expires_in_minutes: Optional[int] = None,
        ) -> Payment:
            body = self._c._payments_create_body(
                amount=amount,
                currency=currency,
                customer_email=customer_email,
                order_id=order_id,
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=metadata,
                expires_in_minutes=expires_in_minutes,
            )
            data = await self._c._post("/api/payments", body)
            return Payment.model_validate(_response_data(data))

        async def get(self, payment_id: str) -> Payment:
            data = await self._c._get(f"/api/payments/{payment_id}")
            return Payment.model_validate(_response_data(data))

        async def get_status(self, payment_id: str) -> PaymentStatus:
            data = await self._c._get(f"/api/payments/{payment_id}")
            return PaymentStatus(**{k: data[k] for k in PaymentStatus.__dataclass_fields__ if k in data})

        async def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            status: Optional[str] = None,
        ) -> Dict[str, Any]:
            params = self._c._payments_list_params(page, limit, status)
            return await self._c._get("/api/payments", params=params)

    @property
    def payments(self) -> "_AsyncPayments":
        return self._AsyncPayments(self)

    # ── invoices ──────────────────────────────────────────────────────────────

    class _AsyncInvoices:
        def __init__(self, client: "AsyncFluxaPay") -> None:
            self._c = client

        async def create(
            self,
            amount: float,
            currency: str,
            customer_email: str,
            customer_name: Optional[str] = None,
            line_items: Optional[List[Dict[str, Any]]] = None,
            notes: Optional[str] = None,
            metadata: Optional[Dict[str, Any]] = None,
            due_date: Optional[str] = None,
            tax_rate: Optional[float] = None,
        ) -> Invoice:
            body = self._c._invoice_create_body(
                amount=amount,
                currency=currency,
                customer_email=customer_email,
                customer_name=customer_name,
                line_items=line_items,
                notes=notes,
                metadata=metadata,
                due_date=due_date,
                tax_rate=tax_rate,
            )
            data = await self._c._post("/api/v1/invoices", body)
            return self._c._invoice_from_response(data)

        async def get(self, invoice_id: str) -> Invoice:
            data = await self._c._get(f"/api/v1/invoices/{invoice_id}")
            return self._c._invoice_from_response(data)

        async def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            status: Optional[str] = None,
            search: Optional[str] = None,
        ) -> Dict[str, Any]:
            params = self._c._invoice_list_params(
                page=page, limit=limit, status=status, search=search,
            )
            return await self._c._get("/api/v1/invoices", params=params)

        async def update_status(self, invoice_id: str, status: str) -> Invoice:
            data = await self._c._patch(
                f"/api/v1/invoices/{invoice_id}/status", {"status": status},
            )
            return self._c._invoice_from_response(data)

    @property
    def invoices(self) -> "_AsyncInvoices":
        return self._AsyncInvoices(self)

    # ── refunds ───────────────────────────────────────────────────────────────

    class _AsyncRefunds:
        def __init__(self, client: "AsyncFluxaPay") -> None:
            self._c = client

        async def create(
            self,
            payment_id: str,
            amount: float,
            reason: Optional[str] = None,
            idempotency_key: Optional[str] = None,
        ) -> RefundResponse:
            body = self._c._refund_create_body(
                payment_id=payment_id,
                amount=amount,
                reason=reason,
                idempotency_key=idempotency_key,
            )
            data = await self._c._post("/api/v1/refunds", body)
            return RefundResponse.model_validate(_response_data(data))

        async def get(self, refund_id: str) -> RefundResponse:
            data = await self._c._get(f"/api/v1/refunds/{refund_id}")
            return RefundResponse.model_validate(_response_data(data))

        async def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            status: Optional[str] = None,
            payment_id: Optional[str] = None,
        ) -> Dict[str, Any]:
            params = self._c._refund_list_params(
                page=page, limit=limit, status=status, payment_id=payment_id,
            )
            return await self._c._get("/api/v1/refunds", params=params)

    @property
    def refunds(self) -> "_AsyncRefunds":
        return self._AsyncRefunds(self)

    # ── settlements ───────────────────────────────────────────────────────────

    class _AsyncSettlements:
        def __init__(self, client: "AsyncFluxaPay") -> None:
            self._c = client

        async def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            status: Optional[str] = None,
            currency: Optional[str] = None,
            date_from: Optional[str] = None,
            date_to: Optional[str] = None,
        ) -> Dict[str, Any]:
            params = self._c._settlements_list_params(
                page=page, limit=limit, status=status,
                currency=currency, date_from=date_from, date_to=date_to,
            )
            return await self._c._get("/api/settlements", params=params)

        async def get(self, settlement_id: str) -> Dict[str, Any]:
            return await self._c._get(f"/api/settlements/{settlement_id}")

        async def summary(self) -> Dict[str, Any]:
            return await self._c._get("/api/settlements/summary")

    @property
    def settlements(self) -> "_AsyncSettlements":
        return self._AsyncSettlements(self)

    # ── webhooks ──────────────────────────────────────────────────────────────

    @property
    def webhooks(self) -> "FluxaPay._Webhooks":
        return FluxaPay._Webhooks()
