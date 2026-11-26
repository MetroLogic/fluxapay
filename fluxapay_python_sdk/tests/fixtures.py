"""Canonical backend API responses used by the mock server (#1267).

Shapes follow fluxapay_backend's controllers: resources are returned either
bare or wrapped in ``{"data": ...}``; errors carry ``message`` and ``code``.
"""

BASE_URL = "https://api.fluxapay.com"
API_KEY = "sk_test_fixture_key"

PAYMENT = {
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

PAYMENT_LIST = {"data": [PAYMENT], "meta": {"page": 1, "limit": 20, "total": 1}}

REFUND = {"id": "ref_123", "payment_id": "pay_123", "amount": 25.0, "status": "pending"}

REFUND_LIST = {"data": [REFUND], "meta": {"page": 1, "limit": 20, "total": 1}}

INVOICE = {
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

INVOICE_LIST = {"data": [INVOICE], "meta": {"page": 1, "limit": 20, "total": 1}}

SETTLEMENT = {"id": "set_123", "amount": 1000.0, "currency": "USDC", "status": "completed"}

SETTLEMENT_LIST = {"data": [SETTLEMENT], "meta": {"page": 1, "limit": 20, "total": 1}}

SETTLEMENT_SUMMARY = {"total_settled": 1000.0, "pending": 0, "currency": "USDC"}

ERRORS = {
    400: {"message": "amount must be positive", "code": "VALIDATION_ERROR"},
    401: {"message": "Invalid API key", "code": "UNAUTHORIZED"},
    404: {"message": "Resource not found", "code": "NOT_FOUND"},
    500: {"message": "Internal server error", "code": "INTERNAL_ERROR"},
}

WEBHOOK_PAYMENT_CONFIRMED = {
    "event": "payment_confirmed",
    "payment_id": "pay_123",
    "merchant_id": "m_1",
    "timestamp": "2024-01-01T00:05:00Z",
    "data": {"amount": 49.99, "currency": "USD", "transaction_hash": "abc123"},
}
