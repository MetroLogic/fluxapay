# FluxaPay Backend Getting Started

This guide matches the currently exposed backend API routes and helps you run a complete merchant flow quickly.

## Base URL

- Local: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/api-docs`

## 1) Authenticate Merchant (Signup -> Verify OTP -> Login)

### Signup

`POST /merchants/signup`

```bash
curl -X POST "http://localhost:3000/api/v1/merchants/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "business_name": "Acme Store",
    "email": "owner@acme.test",
    "phone_number": "+15551234567",
    "country": "US",
    "settlement_currency": "USD",
    "password": "StrongPass123!"
  }'
```

Store the returned `merchantId` from the response.

### Verify OTP

`POST /merchants/verify-otp`

```bash
curl -X POST "http://localhost:3000/api/v1/merchants/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "merchant_id_from_signup",
    "channel": "email",
    "otp": "123456"
  }'
```

### Login

`POST /merchants/login`

```bash
curl -X POST "http://localhost:3000/api/v1/merchants/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@acme.test",
    "password": "StrongPass123!"
  }'
```

Use the returned merchant API key in the `x-api-key` header for merchant-protected endpoints.

## 2) Create a Payment

`POST /payments`

```bash
curl -X POST "http://localhost:3000/api/v1/payments" \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_merchant_api_key" \
  -d '{
    "amount": 120.5,
    "currency": "USDC",
    "customer_email": "buyer@example.com",
    "metadata": {
      "order_id": "ord_001"
    }
  }'
```

Save the returned payment `id`.

## 3) Track Payment Status (Poll or Stream)

### Poll status

`GET /payments/{id}/status`

```bash
curl "http://localhost:3000/api/v1/payments/pay_123/status"
```

### Stream status updates (SSE)

`GET /payments/{id}/stream`

```bash
curl -N "http://localhost:3000/api/v1/payments/pay_123/stream"
```

## 4) Verify Webhook Deliveries

FluxaPay signs webhook payloads with these headers:

- `X-FluxaPay-Signature`
- `X-FluxaPay-Timestamp`

Validate using your merchant webhook secret and this signing format:

`HMAC_SHA256(secret, "${timestamp}.${raw_payload}")`

For full verification and replay-protection examples, see:

- `docs/WEBHOOK_SIGNATURE_VERIFICATION.md`

## Notes

- Merchant-protected routes use `x-api-key`.
- Admin routes use `x-admin-secret`.
- Rate limits apply to auth and public payment status/stream endpoints.
