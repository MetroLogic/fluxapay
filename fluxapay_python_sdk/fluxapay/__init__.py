"""FluxaPay Python SDK."""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union, Literal

import httpx

__version__ = "0.1.0"
__all__ = [
    "FluxaPay",
    "AsyncFluxaPay",
    "FluxaPayError",
    "BadRequestError",
    "AuthenticationError",
    "PermissionDeniedError",
    "NotFoundError",
    "ConflictError",
    "RateLimitError",
    "ServerError",
    "Payment",
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
        self.errors: List[Dict[str, Any]] = []
        if isinstance(raw, dict) and isinstance(raw.get("errors"), list):
            self.errors = raw["errors"]

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}(status_code={self.status_code!r}, "
            f"code={self.code!r}, message={self.message!r})"
        )


class BadRequestError(FluxaPayError):
    """HTTP 400: the request failed validation. Field errors are in ``errors``."""


class AuthenticationError(FluxaPayError):
    """HTTP 401: the API key is missing, invalid or revoked."""


class PermissionDeniedError(FluxaPayError):
    """HTTP 403: authenticated, but not allowed (e.g. ``KYC_REQUIRED``)."""


class NotFoundError(FluxaPayError):
    """HTTP 404: the resource does not exist or belongs to another merchant."""


class ConflictError(FluxaPayError):
    """HTTP 409 / 410 / 422: the resource state prevents the request."""


class RateLimitError(FluxaPayError):
    """HTTP 429: too many requests. ``retry_after`` holds the advised wait in seconds."""

    def __init__(self, *args: Any, retry_after: Optional[float] = None, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.retry_after = retry_after


class ServerError(FluxaPayError):
    """HTTP 5xx: FluxaPay or an upstream dependency failed."""


def _error_class_for(status_code: int) -> type:
    if status_code == 400:
        return BadRequestError
    if status_code == 401:
        return AuthenticationError
    if status_code == 403:
        return PermissionDeniedError
    if status_code == 404:
        return NotFoundError
    if status_code in (409, 410, 422):
        return ConflictError
    if status_code == 429:
        return RateLimitError
    if status_code >= 500:
        return ServerError
    return FluxaPayError


# ── Models ────────────────────────────────────────────────────────────────────


@dataclass
class Payment:
    id: str
    amount: float
    currency: str
    status: str
    checkout_url: str
    stellar_address: str
    customer_email: str
    created_at: str
    expires_at: str
    order_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class PaymentStatus:
    id: str
    status: str
    transaction_hash: Optional[str] = None
    confirmed_at: Optional[str] = None


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
    line_items: List[Dict[str, Any]] = field(default_factory=list)
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


def _headers(api_key: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Default request headers. ``extra`` headers are added, but cannot replace
    the ``Authorization`` header derived from ``api_key``."""
    headers = {
        "Content-Type": "application/json",
        "X-API-Version": _API_VERSION,
    }
    if extra:
        headers.update({k: v for k, v in extra.items() if k.lower() != "authorization"})
    headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    from email.utils import parsedate_to_datetime

    try:
        retry_at = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if retry_at is None:
        return None
    return max(0.0, retry_at.timestamp() - time.time())


def _json_or_none(response: httpx.Response) -> Any:
    if response.status_code == 204 or not response.content:
        return None
    return response.json()


def _raise_for(response: httpx.Response) -> None:
    if not response.is_success:
        try:
            body = response.json()
            if not isinstance(body, dict):
                raise ValueError("error body is not an object")
            message = body.get("message", f"HTTP {response.status_code}")
            code = body.get("code")
        except Exception:
            body = None
            message = f"HTTP {response.status_code}"
            code = None
        if not isinstance(body, dict):
            body = None
        request_id = (
            response.headers.get("x-fluxapay-request-id")
            or response.headers.get("x-request-id")
        )
        error_cls = _error_class_for(response.status_code)
        kwargs: Dict[str, Any] = {}
        if error_cls is RateLimitError:
            kwargs["retry_after"] = _parse_retry_after(response.headers.get("retry-after"))
        raise error_cls(
            status_code=response.status_code,
            message=message,
            raw=body,
            code=code,
            request_id=request_id,
            **kwargs,
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

    @staticmethod
    def _refund_headers(idempotency_key: Optional[str]) -> Optional[Dict[str, str]]:
        return {"Idempotency-Key": idempotency_key} if idempotency_key else None

    def _refund_list_params(self, **kwargs: Any) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}


# ── Synchronous client ────────────────────────────────────────────────────────


class _PaymentLinksMixin:
    @staticmethod
    def _payment_link_body(**kwargs: Any) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}

    @staticmethod
    def _payment_link_list_params(
        page: Optional[int], limit: Optional[int], active: Optional[bool]
    ) -> Dict[str, Any]:
        p: Dict[str, Any] = {}
        if page is not None:
            p["page"] = page
        if limit is not None:
            p["limit"] = limit
        if active is not None:
            p["active"] = "true" if active else "false"
        return p


def _merchant_from_response(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, dict) and isinstance(payload.get("merchant"), dict):
        return payload["merchant"]
    return payload


class FluxaPay(_PaymentsMixin, _SettlementsMixin, _InvoicesMixin, _RefundsMixin, _PaymentLinksMixin):
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

    def __init__(
        self,
        api_key: str,
        base_url: str = _DEFAULT_BASE_URL,
        *,
        timeout: float = 30.0,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        """
        Args:
            api_key: Secret API key (``sk_live_...`` / ``sk_test_...``).
            base_url: API base URL.
            timeout: Request timeout in seconds.
            headers: Extra headers sent with every request (cannot override
                ``Authorization``).
        """
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.Client(
            base_url=self._base_url,
            headers=_headers(api_key, headers),
            timeout=timeout,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "FluxaPay":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        r = self._http.get(path, params=params)
        _raise_for(r)
        return r.json()

    def _post(self, path: str, body: Dict, headers: Optional[Dict[str, str]] = None) -> Any:
        r = self._http.post(path, json=body, headers=headers)
        _raise_for(r)
        return r.json()

    def _patch(self, path: str, body: Dict) -> Any:
        r = self._http.patch(path, json=body)
        _raise_for(r)
        return r.json()

    def _delete(self, path: str) -> Any:
        r = self._http.delete(path)
        _raise_for(r)
        return _json_or_none(r)

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
            return Payment(**{k: data[k] for k in Payment.__dataclass_fields__ if k in data})

        def get(self, payment_id: str) -> Payment:
            data = self._c._get(f"/api/payments/{payment_id}")
            return Payment(**{k: data[k] for k in Payment.__dataclass_fields__ if k in data})

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
        ) -> Dict[str, Any]:
            body = self._c._refund_create_body(
                payment_id=payment_id,
                amount=amount,
                reason=reason,
                idempotency_key=idempotency_key,
            )
            return self._c._post("/api/v1/refunds", body, headers=self._c._refund_headers(idempotency_key))

        def get(self, refund_id: str) -> Dict[str, Any]:
            return self._c._get(f"/api/v1/refunds/{refund_id}")

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

    # ── payment links ─────────────────────────────────────────────────────────

    class _PaymentLinks:
        def __init__(self, client: "FluxaPay") -> None:
            self._c = client

        def create(
            self,
            title: str,
            currency: str,
            amount: Optional[float] = None,
            description: Optional[str] = None,
            redirect_url: Optional[str] = None,
            expiry: Optional[str] = None,
            metadata: Optional[Dict[str, Any]] = None,
            customer_id: Optional[str] = None,
        ) -> Dict[str, Any]:
            """Create a reusable payment link. Omit ``amount`` for an open-amount link."""
            body = self._c._payment_link_body(
                title=title,
                currency=currency,
                amount=amount,
                description=description,
                redirect_url=redirect_url,
                expiry=expiry,
                metadata=metadata,
                customer_id=customer_id,
            )
            return self._c._post("/api/v1/payment-links", body)

        def get(self, link_id: str) -> Dict[str, Any]:
            return self._c._get(f"/api/v1/payment-links/{link_id}")

        def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            active: Optional[bool] = None,
        ) -> Dict[str, Any]:
            params = self._c._payment_link_list_params(page, limit, active)
            return self._c._get("/api/v1/payment-links", params=params)

        def update(
            self,
            link_id: str,
            title: Optional[str] = None,
            description: Optional[str] = None,
            redirect_url: Optional[str] = None,
            active: Optional[bool] = None,
            metadata: Optional[Dict[str, Any]] = None,
        ) -> Dict[str, Any]:
            body = self._c._payment_link_body(
                title=title,
                description=description,
                redirect_url=redirect_url,
                active=active,
                metadata=metadata,
            )
            return self._c._patch(f"/api/v1/payment-links/{link_id}", body)

        def delete(self, link_id: str) -> None:
            """Deactivate (soft-delete) a payment link."""
            self._c._delete(f"/api/v1/payment-links/{link_id}")

    @property
    def payment_links(self) -> "_PaymentLinks":
        return self._PaymentLinks(self)

    # ── merchants ─────────────────────────────────────────────────────────────

    class _Merchants:
        def __init__(self, client: "FluxaPay") -> None:
            self._c = client

        def me(self) -> Dict[str, Any]:
            """Return the authenticated merchant's profile."""
            return _merchant_from_response(self._c._get("/api/v1/merchants/me"))

        def update_webhook(self, webhook_url: str) -> Dict[str, Any]:
            return self._c._patch("/api/v1/merchants/me/webhook", {"webhook_url": webhook_url})

    @property
    def merchants(self) -> "_Merchants":
        return self._Merchants(self)

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
            return cls(**{k: d[k] for k in cls.__dataclass_fields__ if k in d})

    @property
    def webhooks(self) -> "_Webhooks":
        return self._Webhooks()


# ── Asynchronous client ───────────────────────────────────────────────────────


class AsyncFluxaPay(_PaymentsMixin, _SettlementsMixin, _InvoicesMixin, _RefundsMixin, _PaymentLinksMixin):
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

    def __init__(
        self,
        api_key: str,
        base_url: str = _DEFAULT_BASE_URL,
        *,
        timeout: float = 30.0,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers=_headers(api_key, headers),
            timeout=timeout,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncFluxaPay":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    async def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        r = await self._http.get(path, params=params)
        _raise_for(r)
        return r.json()

    async def _post(self, path: str, body: Dict, headers: Optional[Dict[str, str]] = None) -> Any:
        r = await self._http.post(path, json=body, headers=headers)
        _raise_for(r)
        return r.json()

    async def _patch(self, path: str, body: Dict) -> Any:
        r = await self._http.patch(path, json=body)
        _raise_for(r)
        return r.json()

    async def _delete(self, path: str) -> Any:
        r = await self._http.delete(path)
        _raise_for(r)
        return _json_or_none(r)

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
            return Payment(**{k: data[k] for k in Payment.__dataclass_fields__ if k in data})

        async def get(self, payment_id: str) -> Payment:
            data = await self._c._get(f"/api/payments/{payment_id}")
            return Payment(**{k: data[k] for k in Payment.__dataclass_fields__ if k in data})

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
        ) -> Dict[str, Any]:
            body = self._c._refund_create_body(
                payment_id=payment_id,
                amount=amount,
                reason=reason,
                idempotency_key=idempotency_key,
            )
            return await self._c._post("/api/v1/refunds", body, headers=self._c._refund_headers(idempotency_key))

        async def get(self, refund_id: str) -> Dict[str, Any]:
            return await self._c._get(f"/api/v1/refunds/{refund_id}")

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

    # ── payment links ─────────────────────────────────────────────────────────

    class _AsyncPaymentLinks:
        def __init__(self, client: "AsyncFluxaPay") -> None:
            self._c = client

        async def create(
            self,
            title: str,
            currency: str,
            amount: Optional[float] = None,
            description: Optional[str] = None,
            redirect_url: Optional[str] = None,
            expiry: Optional[str] = None,
            metadata: Optional[Dict[str, Any]] = None,
            customer_id: Optional[str] = None,
        ) -> Dict[str, Any]:
            """Create a reusable payment link. Omit ``amount`` for an open-amount link."""
            body = self._c._payment_link_body(
                title=title,
                currency=currency,
                amount=amount,
                description=description,
                redirect_url=redirect_url,
                expiry=expiry,
                metadata=metadata,
                customer_id=customer_id,
            )
            return await self._c._post("/api/v1/payment-links", body)

        async def get(self, link_id: str) -> Dict[str, Any]:
            return await self._c._get(f"/api/v1/payment-links/{link_id}")

        async def list(
            self,
            page: Optional[int] = None,
            limit: Optional[int] = None,
            active: Optional[bool] = None,
        ) -> Dict[str, Any]:
            params = self._c._payment_link_list_params(page, limit, active)
            return await self._c._get("/api/v1/payment-links", params=params)

        async def update(
            self,
            link_id: str,
            title: Optional[str] = None,
            description: Optional[str] = None,
            redirect_url: Optional[str] = None,
            active: Optional[bool] = None,
            metadata: Optional[Dict[str, Any]] = None,
        ) -> Dict[str, Any]:
            body = self._c._payment_link_body(
                title=title,
                description=description,
                redirect_url=redirect_url,
                active=active,
                metadata=metadata,
            )
            return await self._c._patch(f"/api/v1/payment-links/{link_id}", body)

        async def delete(self, link_id: str) -> None:
            """Deactivate (soft-delete) a payment link."""
            await self._c._delete(f"/api/v1/payment-links/{link_id}")

    @property
    def payment_links(self) -> "_AsyncPaymentLinks":
        return self._AsyncPaymentLinks(self)

    # ── merchants ─────────────────────────────────────────────────────────────

    class _AsyncMerchants:
        def __init__(self, client: "AsyncFluxaPay") -> None:
            self._c = client

        async def me(self) -> Dict[str, Any]:
            """Return the authenticated merchant's profile."""
            return _merchant_from_response(await self._c._get("/api/v1/merchants/me"))

        async def update_webhook(self, webhook_url: str) -> Dict[str, Any]:
            return await self._c._patch("/api/v1/merchants/me/webhook", {"webhook_url": webhook_url})

    @property
    def merchants(self) -> "_AsyncMerchants":
        return self._AsyncMerchants(self)

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
