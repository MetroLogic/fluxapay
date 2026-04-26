"""FluxaPay Python SDK."""

from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

__version__ = "0.1.0"
__all__ = [
    "FluxaPay",
    "AsyncFluxaPay",
    "FluxaPayError",
    "Payment",
    "PaymentStatus",
    "Invoice",
    "WebhookEvent",
    "verify_webhook_signature",
]

_DEFAULT_BASE_URL = "https://api.fluxapay.com"
_API_VERSION = "v1"


# ── Errors ────────────────────────────────────────────────────────────────────


class FluxaPayError(Exception):
    def __init__(self, status_code: int, message: str, raw: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.raw = raw


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
    customer_name: str
    customer_email: str
    currency: str
    amount: float
    status: str
    due_date: str
    created_at: str
    updated_at: str
    line_items: List[Dict[str, Any]] = field(default_factory=list)
    notes: Optional[str] = None


@dataclass
class WebhookEvent:
    event: str
    payment_id: str
    merchant_id: str
    timestamp: str
    data: Dict[str, Any]


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
        except Exception:
            body = None
            message = f"HTTP {response.status_code}"
        raise FluxaPayError(response.status_code, message, body)


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


# ── Synchronous client ────────────────────────────────────────────────────────


class FluxaPay(_PaymentsMixin, _SettlementsMixin):
    """Synchronous FluxaPay API client.

    Example::

        from fluxapay import FluxaPay

        client = FluxaPay(api_key="sk_live_...")
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

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        r = self._http.get(path, params=params)
        _raise_for(r)
        return r.json()

    def _post(self, path: str, body: Dict) -> Any:
        r = self._http.post(path, json=body)
        _raise_for(r)
        return r.json()

    def _patch(self, path: str, body: Dict) -> Any:
        r = self._http.patch(path, json=body)
        _raise_for(r)
        return r.json()

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
            return WebhookEvent(**{k: d[k] for k in WebhookEvent.__dataclass_fields__ if k in d})

    @property
    def webhooks(self) -> "_Webhooks":
        return self._Webhooks()


# ── Asynchronous client ───────────────────────────────────────────────────────


class AsyncFluxaPay(_PaymentsMixin, _SettlementsMixin):
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
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncFluxaPay":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    async def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        r = await self._http.get(path, params=params)
        _raise_for(r)
        return r.json()

    async def _post(self, path: str, body: Dict) -> Any:
        r = await self._http.post(path, json=body)
        _raise_for(r)
        return r.json()

    async def _patch(self, path: str, body: Dict) -> Any:
        r = await self._http.patch(path, json=body)
        _raise_for(r)
        return r.json()

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
