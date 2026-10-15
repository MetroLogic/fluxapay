"""Shared fixtures for the FluxaPay Python SDK test suite.

The fixtures below mirror the JSON the FluxaPay backend returns, so tests run
against a respx mock server instead of the live sandbox.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, Iterator

import pytest
import respx

from fluxapay import AsyncFluxaPay, FluxaPay

BASE_URL = "https://api.fluxapay.com"
API_KEY = "sk_test_mock_123"
REQUEST_ID = "6f6d9d8e-3f77-4d19-9f22-92d4f49fb640"

# ── Canonical success payloads ───────────────────────────────────────────────

PAYMENT: Dict[str, Any] = {
    "id": "pay_123",
    "amount": 120.5,
    "currency": "USDC",
    "status": "pending",
    "checkout_url": "https://pay.fluxapay.com/pay/pay_123",
    "stellar_address": "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
    "customer_email": "buyer@example.com",
    "created_at": "2026-10-15T12:00:00.000Z",
    "expires_at": "2026-10-15T12:30:00.000Z",
    "metadata": {"order_id": "ord_1234"},
}

PAYMENT_LIST: Dict[str, Any] = {"payments": [PAYMENT], "total": 1}

PAYMENT_LINK: Dict[str, Any] = {
    "id": "cm4link000001",
    "slug": "k3j9x2ab",
    "title": "Pro plan - monthly",
    "description": "FluxaPay Pro, billed monthly",
    "amount": 25,
    "currency": "USD",
    "redirect_url": "https://shop.example.com/thanks",
    "expiry": "2026-12-31T23:59:59.000Z",
    "active": True,
    "metadata": {"plan": "pro"},
    "short_url": "https://pay.fluxapay.com/pay/k3j9x2ab",
    "total_payments": 0,
    "total_volume": 0,
    "created_at": "2026-10-15T12:00:00.000Z",
}

PAYMENT_LINK_LIST: Dict[str, Any] = {
    "data": [PAYMENT_LINK],
    "meta": {"total": 1, "page": 1, "limit": 20},
}

MERCHANT_RESPONSE: Dict[str, Any] = {
    "message": "Merchant found",
    "merchant": {
        "id": "cm3merchant0001",
        "business_name": "Example Shop",
        "email": "owner@example.com",
        "country": "NG",
        "settlement_currency": "NGN",
        "status": "active",
        "webhook_url": "https://shop.example.com/webhooks/fluxapay",
        "api_key_masked": "sk_live_****abcd",
        "api_key_last_four": "abcd",
    },
}

WEBHOOK_UPDATE_RESPONSE: Dict[str, Any] = {
    "message": "Webhook URL updated",
    "webhook_url": "https://shop.example.com/new-hook",
}

REFUND: Dict[str, Any] = {
    "id": "ref_123",
    "payment_id": "pay_123",
    "amount": 25.0,
    "currency": "USDC",
    "reason": "Duplicate",
    "status": "pending",
}

REFUND_LIST: Dict[str, Any] = {
    "data": {
        "refunds": [REFUND],
        "pagination": {"page": 1, "limit": 20, "total": 1, "total_pages": 1},
    }
}

# ── Canonical error payloads (backend ErrorResponse shape) ───────────────────

ERROR_BODIES: Dict[int, Dict[str, Any]] = {
    400: {
        "code": "VALIDATION_ERROR",
        "message": "Validation failed",
        "errors": [{"field": "amount", "message": "Amount must be greater than 0"}],
    },
    401: {"code": "INVALID_API_KEY", "message": "Invalid API key"},
    403: {
        "code": "KYC_REQUIRED",
        "message": "Merchant KYC status is 'pending_review'. Payment creation requires approved KYC.",
        "details": {"kyc_status": "pending_review"},
    },
    404: {"code": "NOT_FOUND", "message": "Resource not found"},
    410: {"code": "PAYMENT_LINK_EXPIRED", "message": "Payment link has expired"},
    429: {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please slow down.", "retry_after_seconds": 30},
    500: {"code": "INTERNAL_ERROR", "message": "Internal Server Error"},
    503: {"code": "SERVICE_UNAVAILABLE", "message": "Service temporarily unavailable"},
}


def fixture(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return a deep copy so a test can't mutate shared fixtures."""
    return copy.deepcopy(payload)


@pytest.fixture
def mock_api() -> Iterator[respx.MockRouter]:
    """A respx router acting as the FluxaPay API. Unmatched requests fail the test."""
    with respx.mock(base_url=BASE_URL, assert_all_called=False, assert_all_mocked=True) as router:
        yield router


@pytest.fixture
def client() -> Iterator[FluxaPay]:
    with FluxaPay(api_key=API_KEY, base_url=BASE_URL) as c:
        yield c


@pytest.fixture
async def async_client() -> Any:
    async with AsyncFluxaPay(api_key=API_KEY, base_url=BASE_URL) as c:
        yield c
