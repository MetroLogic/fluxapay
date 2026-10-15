"""Asynchronous FluxaPay client built on ``httpx.AsyncClient``.

Use it from FastAPI, Starlette, Django async views or any other asyncio code::

    from fluxapay import AsyncFluxaPayClient

    async with AsyncFluxaPayClient(api_key="sk_live_...") as client:
        payment = await client.payments.create(
            amount=49.99, currency="USDC", customer_email="buyer@example.com"
        )
        link = await client.payment_links.get("cm4link000001")

Every resource method mirrors the synchronous :class:`fluxapay.FluxaPay`
client: same names, arguments and return types, but awaitable.
"""

from __future__ import annotations

from dataclasses import fields as dataclass_fields
from typing import Any, Dict, List, Mapping, Optional, Type, TypeVar

import httpx

from . import (
    FluxaPay,
    Invoice,
    Payment,
    PaymentStatus,
    WebhookEvent,
    _API_VERSION,
    _DEFAULT_BASE_URL,
    _raise_for,
    verify_webhook_signature,
)

__all__ = ["AsyncFluxaPayClient"]

_T = TypeVar("_T")


def _build(cls: Type[_T], data: Mapping[str, Any]) -> _T:
    """Instantiate a dataclass model, ignoring fields the API added later."""
    names = {f.name for f in dataclass_fields(cls)}  # type: ignore[arg-type]
    return cls(**{k: v for k, v in data.items() if k in names})


def _compact(**kwargs: Any) -> Dict[str, Any]:
    """Drop ``None`` values so optional arguments are not sent."""
    return {k: v for k, v in kwargs.items() if v is not None}


def _invoice(payload: Mapping[str, Any]) -> Invoice:
    data = payload.get("data", payload)
    return _build(Invoice, data)


class AsyncFluxaPayClient:
    """Async FluxaPay API client.

    Args:
        api_key: Secret API key (``sk_live_...`` / ``sk_test_...``).
        base_url: API base URL.
        timeout: Request timeout in seconds.
        headers: Extra headers sent with every request. They cannot replace
            the ``Authorization`` header derived from ``api_key``.
        http_client: An existing ``httpx.AsyncClient`` to send requests with
            (custom transports, proxies, connection pools). It is not closed
            by :meth:`aclose`; its owner stays responsible for it.

    Use it as an async context manager so the connection pool is closed::

        async with AsyncFluxaPayClient(api_key="sk_test_...") as client:
            ...
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = _DEFAULT_BASE_URL,
        *,
        timeout: float = 30.0,
        headers: Optional[Mapping[str, str]] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._headers = self._default_headers(api_key, headers)
        self._owns_http = http_client is None
        self._http = http_client or httpx.AsyncClient(timeout=timeout)

        self.payments = _AsyncPayments(self)
        self.payment_links = _AsyncPaymentLinks(self)
        self.invoices = _AsyncInvoices(self)
        self.refunds = _AsyncRefunds(self)
        self.settlements = _AsyncSettlements(self)
        self.merchants = _AsyncMerchants(self)
        self.webhooks = _AsyncWebhooks()

    @staticmethod
    def _default_headers(api_key: str, extra: Optional[Mapping[str, str]]) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "X-API-Version": _API_VERSION,
        }
        if extra:
            headers.update({k: v for k, v in extra.items() if k.lower() != "authorization"})
        headers["Authorization"] = f"Bearer {api_key}"
        return headers

    # ── lifecycle ─────────────────────────────────────────────────────────────

    async def aclose(self) -> None:
        """Close the underlying connection pool (if this client created it)."""
        if self._owns_http:
            await self._http.aclose()

    async def __aenter__(self) -> "AsyncFluxaPayClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    # ── transport ─────────────────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json: Optional[Mapping[str, Any]] = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        merged = dict(self._headers)
        if headers:
            merged.update(headers)
        response = await self._http.request(
            method,
            f"{self._base_url}{path}",
            params=dict(params) if params else None,
            json=dict(json) if json is not None else None,
            headers=merged,
        )
        _raise_for(response)
        if response.status_code == 204 or not response.content:
            return None
        return response.json()


class _Resource:
    def __init__(self, client: AsyncFluxaPayClient) -> None:
        self._c = client


# ── payments ──────────────────────────────────────────────────────────────────


class _AsyncPayments(_Resource):
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
        idempotency_key: Optional[str] = None,
    ) -> Payment:
        body = _compact(
            amount=amount,
            currency=currency,
            customer_email=customer_email,
            order_id=order_id,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
            expires_in_minutes=expires_in_minutes,
        )
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        data = await self._c._request("POST", "/api/payments", json=body, headers=headers)
        return _build(Payment, data)

    async def get(self, payment_id: str) -> Payment:
        data = await self._c._request("GET", f"/api/payments/{payment_id}")
        return _build(Payment, data)

    async def get_status(self, payment_id: str) -> PaymentStatus:
        data = await self._c._request("GET", f"/api/payments/{payment_id}")
        return _build(PaymentStatus, data)

    async def list(
        self,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        params = _compact(page=page, limit=limit, status=status)
        return await self._c._request("GET", "/api/payments", params=params)


# ── payment links ─────────────────────────────────────────────────────────────


class _AsyncPaymentLinks(_Resource):
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
        """Create a reusable payment link. Omit ``amount`` for an open amount."""
        body = _compact(
            title=title,
            currency=currency,
            amount=amount,
            description=description,
            redirect_url=redirect_url,
            expiry=expiry,
            metadata=metadata,
            customer_id=customer_id,
        )
        return await self._c._request("POST", "/api/v1/payment-links", json=body)

    async def get(self, link_id: str) -> Dict[str, Any]:
        return await self._c._request("GET", f"/api/v1/payment-links/{link_id}")

    async def list(
        self,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        params = _compact(
            page=page,
            limit=limit,
            active=None if active is None else ("true" if active else "false"),
        )
        return await self._c._request("GET", "/api/v1/payment-links", params=params)

    async def update(
        self,
        link_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        redirect_url: Optional[str] = None,
        active: Optional[bool] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        body = _compact(
            title=title,
            description=description,
            redirect_url=redirect_url,
            active=active,
            metadata=metadata,
        )
        return await self._c._request("PATCH", f"/api/v1/payment-links/{link_id}", json=body)

    async def delete(self, link_id: str) -> None:
        """Deactivate (soft-delete) a payment link."""
        await self._c._request("DELETE", f"/api/v1/payment-links/{link_id}")


# ── invoices ──────────────────────────────────────────────────────────────────


class _AsyncInvoices(_Resource):
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
        body = _compact(
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
        return _invoice(await self._c._request("POST", "/api/v1/invoices", json=body))

    async def get(self, invoice_id: str) -> Invoice:
        return _invoice(await self._c._request("GET", f"/api/v1/invoices/{invoice_id}"))

    async def list(
        self,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Dict[str, Any]:
        params = _compact(page=page, limit=limit, status=status, search=search)
        return await self._c._request("GET", "/api/v1/invoices", params=params)

    async def update_status(self, invoice_id: str, status: str) -> Invoice:
        data = await self._c._request(
            "PATCH", f"/api/v1/invoices/{invoice_id}/status", json={"status": status}
        )
        return _invoice(data)


# ── refunds ───────────────────────────────────────────────────────────────────


class _AsyncRefunds(_Resource):
    async def create(
        self,
        payment_id: str,
        amount: float,
        reason: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        body = _compact(
            payment_id=payment_id,
            amount=amount,
            reason=reason,
            idempotency_key=idempotency_key,
        )
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        return await self._c._request("POST", "/api/v1/refunds", json=body, headers=headers)

    async def get(self, refund_id: str) -> Dict[str, Any]:
        return await self._c._request("GET", f"/api/v1/refunds/{refund_id}")

    async def list(
        self,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
        payment_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        params = _compact(page=page, limit=limit, status=status, payment_id=payment_id)
        return await self._c._request("GET", "/api/v1/refunds", params=params)


# ── settlements ───────────────────────────────────────────────────────────────


class _AsyncSettlements(_Resource):
    async def list(
        self,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        status: Optional[str] = None,
        currency: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> Dict[str, Any]:
        params = _compact(
            page=page,
            limit=limit,
            status=status,
            currency=currency,
            date_from=date_from,
            date_to=date_to,
        )
        return await self._c._request("GET", "/api/settlements", params=params)

    async def get(self, settlement_id: str) -> Dict[str, Any]:
        return await self._c._request("GET", f"/api/settlements/{settlement_id}")

    async def summary(self) -> Dict[str, Any]:
        return await self._c._request("GET", "/api/settlements/summary")


# ── merchants ─────────────────────────────────────────────────────────────────


class _AsyncMerchants(_Resource):
    async def me(self) -> Dict[str, Any]:
        """Return the authenticated merchant's profile."""
        payload = await self._c._request("GET", "/api/v1/merchants/me")
        if isinstance(payload, dict) and isinstance(payload.get("merchant"), dict):
            return payload["merchant"]
        return payload

    async def update_webhook(self, webhook_url: str) -> Dict[str, Any]:
        return await self._c._request(
            "PATCH", "/api/v1/merchants/me/webhook", json={"webhook_url": webhook_url}
        )


# ── webhooks ──────────────────────────────────────────────────────────────────


class _AsyncWebhooks:
    """Webhook helpers. These are CPU-only, so they are plain (sync) methods,
    exactly as on the synchronous client."""

    def verify(
        self,
        raw_body: str,
        signature: str,
        secret: str,
        timestamp: Optional[str] = None,
        tolerance_seconds: int = 300,
    ) -> bool:
        return verify_webhook_signature(raw_body, signature, timestamp or "", secret, tolerance_seconds)

    def parse(self, raw_body: str) -> WebhookEvent:
        return FluxaPay._Webhooks().parse(raw_body)
