# Checkout sessions

A checkout session is a **payment**: you create it server-side, FluxaPay assigns a Stellar deposit
address and a hosted checkout page, and you send your customer to `checkout_url`.

```
Your server ──POST /api/v1/payments──▶ FluxaPay
     ◀── 201 { id, checkout_url, stellar_address, expiration, ... }
Customer ──▶ checkout_url (hosted page, polls status)
FluxaPay ──webhook payment.confirmed──▶ your webhook URL
Customer ◀── redirected to success_url
```

See the [API overview](./README.md) for authentication, errors and rate limits.

## Create a checkout session

`POST /api/v1/payments`

Requires your secret API key and a merchant account with **approved KYC**.

### Request body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | yes | Amount to charge. Must be greater than 0. |
| `currency` | string | yes | Must be `"USDC"`. |
| `customer_email` | string | yes | Customer's email address. |
| `description` | string | no | Shown to the customer on the checkout page. Max 500 characters. |
| `note` | string | no | Internal note for your team, never shown to the customer. Max 500 characters. |
| `metadata` | object | no | Your own key/value data (e.g. `order_id`). Max 16 KB serialized and 5 levels deep by default. |
| `customer_id` | string | no | ID of an existing customer that belongs to your merchant account. |
| `success_url` | string | no | `https://` URL the customer is sent to after payment is confirmed. Max 2048 characters. |
| `cancel_url` | string | no | `https://` URL for customers who abandon checkout. Stored and exposed to the checkout page. Max 2048 characters. |
| `expires_in_seconds` | integer | no | Session lifetime. Capped by your plan's maximum; defaults to the platform default. |

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization: Bearer <key>` or `x-api-key: <key>` | yes | Your secret API key. |
| `Content-Type: application/json` | yes | |
| `Idempotency-Key` | no | Makes retries safe. See [Idempotency](./README.md#idempotency). |

### Example request

```bash
curl -X POST "$FLUXAPAY_BASE_URL/api/v1/payments" \
  -H "Authorization: Bearer $FLUXAPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order_1234" \
  -d '{
    "amount": 120.5,
    "currency": "USDC",
    "customer_email": "buyer@example.com",
    "description": "Order #1234",
    "metadata": { "order_id": "ord_1234" },
    "success_url": "https://shop.example.com/orders/1234/thanks",
    "cancel_url": "https://shop.example.com/cart",
    "expires_in_seconds": 1800
  }'
```

<details>
<summary><strong>JavaScript</strong> (Node 18+)</summary>

```js
const res = await fetch(`${process.env.FLUXAPAY_BASE_URL}/api/v1/payments`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.FLUXAPAY_API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': 'order_1234',
  },
  body: JSON.stringify({
    amount: 120.5,
    currency: 'USDC',
    customer_email: 'buyer@example.com',
    description: 'Order #1234',
    metadata: { order_id: 'ord_1234' },
    success_url: 'https://shop.example.com/orders/1234/thanks',
    cancel_url: 'https://shop.example.com/cart',
    expires_in_seconds: 1800,
  }),
});

const body = await res.json();
if (!res.ok) throw new Error(`${body.code}: ${body.message}`);
console.log('Send the customer to', body.checkout_url);
```

</details>

<details>
<summary><strong>Python</strong></summary>

```python
import os
import requests

res = requests.post(
    f"{os.environ['FLUXAPAY_BASE_URL']}/api/v1/payments",
    headers={
        "Authorization": f"Bearer {os.environ['FLUXAPAY_API_KEY']}",
        "Idempotency-Key": "order_1234",
    },
    json={
        "amount": 120.5,
        "currency": "USDC",
        "customer_email": "buyer@example.com",
        "description": "Order #1234",
        "metadata": {"order_id": "ord_1234"},
        "success_url": "https://shop.example.com/orders/1234/thanks",
        "cancel_url": "https://shop.example.com/cart",
        "expires_in_seconds": 1800,
    },
    timeout=15,
)
body = res.json()
if not res.ok:
    raise RuntimeError(f"{body['code']}: {body['message']}")
print("Send the customer to", body["checkout_url"])
```

</details>

<details>
<summary><strong>Go</strong></summary>

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	payload, _ := json.Marshal(map[string]any{
		"amount":             120.5,
		"currency":           "USDC",
		"customer_email":     "buyer@example.com",
		"description":        "Order #1234",
		"metadata":           map[string]string{"order_id": "ord_1234"},
		"success_url":        "https://shop.example.com/orders/1234/thanks",
		"cancel_url":         "https://shop.example.com/cart",
		"expires_in_seconds": 1800,
	})

	req, _ := http.NewRequest(http.MethodPost, os.Getenv("FLUXAPAY_BASE_URL")+"/api/v1/payments", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("FLUXAPAY_API_KEY"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", "order_1234")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer res.Body.Close()

	var body map[string]any
	_ = json.NewDecoder(res.Body).Decode(&body)
	if res.StatusCode != http.StatusCreated {
		panic(fmt.Sprintf("%v: %v", body["code"], body["message"]))
	}
	fmt.Println("Send the customer to", body["checkout_url"])
}
```

</details>

### Response `201 Created`

```json
{
  "id": "6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41",
  "merchantId": "cm3merchant0001",
  "amount": "120.5",
  "currency": "USDC",
  "usdc_amount": "120.5",
  "fx_rate": "1",
  "fx_rate_stale": false,
  "customer_email": "buyer@example.com",
  "description": "Order #1234",
  "note": null,
  "metadata": { "order_id": "ord_1234" },
  "expiration": "2026-10-15T12:30:00.000Z",
  "status": "pending",
  "paid_amount": "0",
  "checkout_url": "https://pay.fluxapay.com/pay/6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41",
  "success_url": "https://shop.example.com/orders/1234/thanks",
  "cancel_url": "https://shop.example.com/cart",
  "stellar_address": "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
  "transaction_hash": null,
  "customerId": null,
  "is_test_mode": true,
  "createdAt": "2026-10-15T12:00:00.000Z"
}
```

Notes on the response:

- Decimal fields (`amount`, `usdc_amount`, `fx_rate`, `paid_amount`) are serialized as **strings** to
  avoid floating-point loss. Parse them with a decimal library if you do arithmetic.
- Internal fields may also appear in the payload. Treat any field not documented here as unstable.
- `checkout_url` is the only URL you need to give the customer.

### Errors

| Status | `code` | Cause |
|--------|--------|-------|
| `400` | `VALIDATION_ERROR` | A field failed validation (see `errors[]`), e.g. `currency` is not `USDC`, a non-https `success_url`, or an unknown `customer_id`. |
| `400` | `INVALID_AMOUNT` | `amount` is not a positive, finite number. |
| `400` | `INVALID_METADATA` | `metadata` is too large or too deeply nested. |
| `400` | `INVALID_IDEMPOTENCY_KEY` | `Idempotency-Key` is empty or longer than 255 characters. |
| `401` | `AUTHENTICATION_REQUIRED` / `INVALID_API_KEY` | Missing or invalid API key. |
| `403` | `KYC_REQUIRED` | Your KYC is not approved yet. `details.kyc_status` has the current state. |
| `422` | `IDEMPOTENCY_CONFLICT` | The `Idempotency-Key` was already used with a different body. |
| `429` | `PAYMENT_RATE_LIMIT` / `RATE_LIMIT_EXCEEDED` | Too many payments or requests. Wait `Retry-After` seconds. |
| `502` | `FX_INVALID_RATE` | The FX provider returned an unusable rate. Retry later. |
| `500` | `PAYMENT_CREATE_FAILED` | Unexpected failure. Safe to retry with the same `Idempotency-Key`. |

Example `403`:

```json
{
  "code": "KYC_REQUIRED",
  "message": "Merchant KYC status is 'pending_review'. Payment creation requires approved KYC.",
  "details": {
    "kyc_status": "pending_review",
    "kyc_submission_url": "https://api.fluxapay.com/api/v1/merchants/kyc"
  }
}
```

## Retrieve a checkout session (merchant)

`GET /api/v1/payments/{id}`. Authenticated; returns the full payment you own.

```bash
curl "$FLUXAPAY_BASE_URL/api/v1/payments/6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41" \
  -H "Authorization: Bearer $FLUXAPAY_API_KEY"
```

Returns `404 PAYMENT_NOT_FOUND` if the payment does not exist or belongs to another merchant.

## Hosted checkout page

Redirect the customer to `checkout_url`. The page shows the amount, deposit address, QR code and
countdown, and it polls the public endpoints below. Branding comes from your merchant settings
(`checkout_logo_url`, `checkout_accent_color`). You can override them per visit with query parameters:

| Query parameter | Example | Effect |
|-----------------|---------|--------|
| `accentColor` (alias `primaryColor`) | `?accentColor=%23635BFF` | Accent colour for buttons and highlights |
| `logoUrl` | `?logoUrl=https%3A%2F%2Fshop.example.com%2Flogo.png` | Logo shown in the header |

### Public checkout details

`GET /api/v1/payments/checkout/{id}`. No authentication. Returns a PII-free view of the session.

```bash
curl "$FLUXAPAY_BASE_URL/api/v1/payments/checkout/6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41"
```

```json
{
  "id": "6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41",
  "amount": 120.5,
  "currency": "USDC",
  "address": "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37",
  "expiresAt": "2026-10-15T12:30:00.000Z",
  "status": "pending",
  "merchantName": "Example Shop",
  "successUrl": "https://shop.example.com/orders/1234/thanks",
  "cancelUrl": "https://shop.example.com/cart",
  "description": "Order #1234",
  "checkoutLogoUrl": "https://shop.example.com/logo.png",
  "checkoutAccentColor": "#635BFF"
}
```

Optional keys (`successUrl`, `cancelUrl`, `description`, `checkoutLogoUrl`, `checkoutAccentColor`,
`memo`, `memoType`, `memoRequired`) are omitted when not set. Returns `404 PAYMENT_NOT_FOUND` if the
session does not exist or has no deposit address yet.

### Public checkout status

`GET /api/v1/payments/checkout/{id}/status`. No authentication. Cheapest way to poll.

```bash
curl "$FLUXAPAY_BASE_URL/api/v1/payments/checkout/6f1c2a9e-4b7d-4c1e-9a55-2f0d3c8b7e41/status"
```

```json
{ "status": "confirmed" }
```

See [Status callbacks and redirects](./status-callbacks-and-redirects.md) for what each status means
and how to react to it.
