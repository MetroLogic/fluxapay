# Payment links

A payment link is a reusable URL (`https://pay.fluxapay.com/pay/{slug}`) you can share by email,
chat or QR code. Every time a customer pays through it, FluxaPay creates a new payment (checkout
session) linked to it and updates the link's `total_payments` and `total_volume`.

Links can have a **fixed amount** or an **open amount** (the customer, or your page, supplies the
amount at charge time).

See the [API overview](./README.md) for authentication, errors and rate limits.

| Operation | Method and path | Auth |
|-----------|-----------------|------|
| Create | `POST /api/v1/payment-links` | API key |
| List | `GET /api/v1/payment-links` | API key |
| Retrieve | `GET /api/v1/payment-links/{id}` | API key |
| Update | `PATCH /api/v1/payment-links/{id}` | API key |
| Deactivate | `DELETE /api/v1/payment-links/{id}` | API key |
| Resolve by slug | `GET /api/v1/payment-links/resolve/{slug}` | Public |
| Charge | `POST /api/v1/payment-links/resolve/{slug}/charge` | Public |

## Create a payment link

`POST /api/v1/payment-links`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | 1–200 characters. Shown on the checkout page. |
| `currency` | string | yes | Exactly 3 characters, e.g. `"USD"`. |
| `amount` | number | no | Fixed amount in major units (e.g. `25.00`). Omit for an open-amount link. Stored to 2 decimal places. |
| `description` | string | no | Up to 500 characters. Also used as the description of payments created from the link. |
| `redirect_url` | string | no | Absolute URL stored with the link and returned on retrieve/update. |
| `expiry` | string | no | ISO 8601 date-time (e.g. `2026-12-31T23:59:59Z`). After this the link returns `410`. |
| `metadata` | object | no | Up to **10** key/value pairs. Copied onto every payment created from the link. |
| `customer_id` | string | no | Pre-assign the link to one of your customers. Their email is used when a charge has none. |

```bash
curl -X POST "$FLUXAPAY_BASE_URL/api/v1/payment-links" \
  -H "Authorization: Bearer $FLUXAPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Pro plan - monthly",
    "description": "FluxaPay Pro, billed monthly",
    "amount": 25,
    "currency": "USD",
    "redirect_url": "https://shop.example.com/thanks",
    "expiry": "2026-12-31T23:59:59Z",
    "metadata": { "plan": "pro", "interval": "month" }
  }'
```

<details>
<summary><strong>JavaScript</strong> (Node 18+)</summary>

```js
const res = await fetch(`${process.env.FLUXAPAY_BASE_URL}/api/v1/payment-links`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.FLUXAPAY_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: 'Pro plan - monthly',
    description: 'FluxaPay Pro, billed monthly',
    amount: 25,
    currency: 'USD',
    redirect_url: 'https://shop.example.com/thanks',
    expiry: '2026-12-31T23:59:59Z',
    metadata: { plan: 'pro', interval: 'month' },
  }),
});

const link = await res.json();
if (!res.ok) throw new Error(`${link.code}: ${link.message}`);
console.log('Share this link:', link.short_url);
```

</details>

<details>
<summary><strong>Python</strong></summary>

```python
import os
import requests

res = requests.post(
    f"{os.environ['FLUXAPAY_BASE_URL']}/api/v1/payment-links",
    headers={"Authorization": f"Bearer {os.environ['FLUXAPAY_API_KEY']}"},
    json={
        "title": "Pro plan - monthly",
        "description": "FluxaPay Pro, billed monthly",
        "amount": 25,
        "currency": "USD",
        "redirect_url": "https://shop.example.com/thanks",
        "expiry": "2026-12-31T23:59:59Z",
        "metadata": {"plan": "pro", "interval": "month"},
    },
    timeout=15,
)
link = res.json()
if not res.ok:
    raise RuntimeError(f"{link['code']}: {link['message']}")
print("Share this link:", link["short_url"])
```

</details>

<details>
<summary><strong>Go</strong></summary>

```go
payload, _ := json.Marshal(map[string]any{
	"title":        "Pro plan - monthly",
	"description":  "FluxaPay Pro, billed monthly",
	"amount":       25,
	"currency":     "USD",
	"redirect_url": "https://shop.example.com/thanks",
	"expiry":       "2026-12-31T23:59:59Z",
	"metadata":     map[string]string{"plan": "pro", "interval": "month"},
})

req, _ := http.NewRequest(http.MethodPost, os.Getenv("FLUXAPAY_BASE_URL")+"/api/v1/payment-links", bytes.NewReader(payload))
req.Header.Set("Authorization", "Bearer "+os.Getenv("FLUXAPAY_API_KEY"))
req.Header.Set("Content-Type", "application/json")

res, err := http.DefaultClient.Do(req)
if err != nil {
	log.Fatal(err)
}
defer res.Body.Close()

var link map[string]any
_ = json.NewDecoder(res.Body).Decode(&link)
if res.StatusCode != http.StatusCreated {
	log.Fatalf("%v: %v", link["code"], link["message"])
}
fmt.Println("Share this link:", link["short_url"])
```

(Imports: `bytes`, `encoding/json`, `fmt`, `log`, `net/http`, `os`.)

</details>

### Response `201 Created`

```json
{
  "id": "cm4link000001",
  "slug": "k3j9x2ab",
  "title": "Pro plan - monthly",
  "description": "FluxaPay Pro, billed monthly",
  "amount": 25,
  "currency": "USD",
  "redirect_url": "https://shop.example.com/thanks",
  "expiry": "2026-12-31T23:59:59.000Z",
  "active": true,
  "metadata": { "plan": "pro", "interval": "month" },
  "short_url": "https://pay.fluxapay.com/pay/k3j9x2ab",
  "total_payments": 0,
  "total_volume": 0,
  "created_at": "2026-10-15T12:00:00.000Z"
}
```

`amount` is `null` for open-amount links. `slug` is an 8-character random string.

### Errors

| Status | `code` | Cause |
|--------|--------|-------|
| `400` | `VALIDATION_ERROR` | e.g. missing `title`, `currency` not 3 characters, invalid `redirect_url` or `expiry`, or more than 10 metadata keys (`Metadata cannot exceed 10 key-value pairs`). |
| `401` | `AUTHENTICATION_REQUIRED` / `INVALID_API_KEY` | Missing or invalid API key. |

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "errors": [
    { "field": "currency", "message": "Too small: expected string to have >=3 characters" }
  ]
}
```

## List payment links

`GET /api/v1/payment-links?page=1&limit=20&active=true`

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | `1` | Page number, 1-indexed. |
| `limit` | integer | `20` | Items per page, max 100. |
| `active` | boolean | | `true` for active links only, `false` for inactive only. Omit for all. |

```bash
curl "$FLUXAPAY_BASE_URL/api/v1/payment-links?page=1&limit=20&active=true" \
  -H "Authorization: Bearer $FLUXAPAY_API_KEY"
```

```json
{
  "data": [
    {
      "id": "cm4link000001",
      "slug": "k3j9x2ab",
      "title": "Pro plan - monthly",
      "description": "FluxaPay Pro, billed monthly",
      "amount": 25,
      "currency": "USD",
      "active": true,
      "expiry": "2026-12-31T23:59:59.000Z",
      "total_payments": 3,
      "total_volume": 75,
      "created_at": "2026-10-15T12:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20 }
}
```

## Retrieve a payment link

`GET /api/v1/payment-links/{id}`

```bash
curl "$FLUXAPAY_BASE_URL/api/v1/payment-links/cm4link000001" \
  -H "Authorization: Bearer $FLUXAPAY_API_KEY"
```

```json
{
  "id": "cm4link000001",
  "slug": "k3j9x2ab",
  "title": "Pro plan - monthly",
  "description": "FluxaPay Pro, billed monthly",
  "amount": 25,
  "currency": "USD",
  "redirect_url": "https://shop.example.com/thanks",
  "expiry": "2026-12-31T23:59:59.000Z",
  "active": true,
  "metadata": { "plan": "pro", "interval": "month" },
  "total_payments": 3,
  "total_volume": 75,
  "customer": null,
  "created_at": "2026-10-15T12:00:00.000Z",
  "updated_at": "2026-10-15T12:00:00.000Z"
}
```

If the link has expired, the response contains the stored record with `"active": false` and
`"expired": true`. Returns `404 PAYMENT_LINK_NOT_FOUND` for unknown IDs or links owned by another merchant.

## Customise a payment link

`PATCH /api/v1/payment-links/{id}`. Send only the fields you want to change.

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | 1–200 characters. |
| `description` | string | Up to 500 characters. |
| `redirect_url` | string | Absolute URL. |
| `active` | boolean | `false` pauses the link (resolve/charge return `410`), `true` re-enables it. |
| `metadata` | object | Replaces the whole metadata object. Up to 10 keys. |

`amount`, `currency` and `expiry` cannot be changed. Create a new link instead.

```bash
curl -X PATCH "$FLUXAPAY_BASE_URL/api/v1/payment-links/cm4link000001" \
  -H "Authorization: Bearer $FLUXAPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Pro plan - monthly (10% off)", "metadata": { "plan": "pro", "promo": "OCT10" } }'
```

The response has the same shape as create, without `short_url`, `expiry` and `created_at`, plus `updated_at`.

The hosted checkout page uses your merchant branding (`checkout_logo_url`, `checkout_accent_color`),
which `GET /resolve/{slug}` returns under `merchant`. You can also override the colour and logo per
visit with `?accentColor=` and `?logoUrl=` query parameters, as described in
[Checkout sessions](./checkout-sessions.md#hosted-checkout-page).

## Deactivate a payment link

`DELETE /api/v1/payment-links/{id}`. This is a soft delete: it sets `active` to `false` and keeps
history. Re-enable with `PATCH { "active": true }`.

```bash
curl -X DELETE "$FLUXAPAY_BASE_URL/api/v1/payment-links/cm4link000001" \
  -H "Authorization: Bearer $FLUXAPAY_API_KEY"
```

Returns `204 No Content`.

## Resolve a link (public)

`GET /api/v1/payment-links/resolve/{slug}`. No authentication; used by the hosted page to render the link.

```bash
curl "$FLUXAPAY_BASE_URL/api/v1/payment-links/resolve/k3j9x2ab"
```

```json
{
  "id": "cm4link000001",
  "slug": "k3j9x2ab",
  "title": "Pro plan - monthly",
  "description": "FluxaPay Pro, billed monthly",
  "amount": 25,
  "currency": "USD",
  "expiry": "2026-12-31T23:59:59.000Z",
  "merchant": {
    "business_name": "Example Shop",
    "checkout_logo_url": "https://shop.example.com/logo.png",
    "checkout_accent_color": "#635BFF"
  },
  "short_url": "https://pay.fluxapay.com/pay/k3j9x2ab"
}
```

| Status | `code` | Cause |
|--------|--------|-------|
| `404` | `PAYMENT_LINK_NOT_FOUND` | No link with that slug. |
| `410` | `PAYMENT_LINK_INACTIVE` | The link was deactivated. |
| `410` | `PAYMENT_LINK_EXPIRED` | `expiry` has passed. |
| `429` | `RATE_LIMIT_EXCEEDED` | Per-IP limit hit. See [rate limits](./README.md#rate-limits). |

## Charge a link (public)

`POST /api/v1/payment-links/resolve/{slug}/charge` creates a payment from the link and returns its
checkout URL.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | for open-amount links | Required when the link has no fixed amount. If supplied for a fixed-amount link, it overrides the link amount. |
| `customer_email` | string | no | Falls back to the link's assigned customer email. |

```bash
curl -X POST "$FLUXAPAY_BASE_URL/api/v1/payment-links/resolve/k3j9x2ab/charge" \
  -H "Content-Type: application/json" \
  -d '{ "customer_email": "buyer@example.com" }'
```

```json
{
  "id": "0b8e5c1d-7f2a-4e3b-9c6d-1a2b3c4d5e6f",
  "amount": 25,
  "currency": "USD",
  "status": "pending",
  "checkout_url": "https://pay.fluxapay.com/pay/0b8e5c1d-7f2a-4e3b-9c6d-1a2b3c4d5e6f"
}
```

The payment inherits the link's `currency`, `metadata` and `description`, and expires at the link's
`expiry` or 15 minutes after creation if the link has none.

| Status | `code` | Cause |
|--------|--------|-------|
| `400` | `MISSING_REQUIRED_FIELD` | Open-amount link charged without `amount`. |
| `404` | `PAYMENT_LINK_NOT_FOUND` | No link with that slug. |
| `410` | `PAYMENT_LINK_INACTIVE` / `PAYMENT_LINK_EXPIRED` | Link deactivated or expired. |
| `429` | `RATE_LIMIT_EXCEEDED` | Per-IP limit hit. |

Track the resulting payment exactly like a checkout session: see
[Status callbacks and redirects](./status-callbacks-and-redirects.md).
