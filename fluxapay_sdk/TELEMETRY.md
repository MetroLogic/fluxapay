# Timeouts, telemetry hooks and batch links

```ts
const client = new FluxaPay({
  apiKey: 'sk_live_...',
  timeoutMs: 10_000, // default 15000, 0 disables
  onRequest: (req) => console.log('->', req.method, req.url),
  onResponse: (res, ms) => console.log('<-', res.status, `${ms}ms`),
});

try {
  await client.payments.get('pay_1');
} catch (e) {
  if (e instanceof FluxaPayTimeoutError) console.error(e.url, e.timeoutMs);
}
```

Batch creation with bounded concurrency (default 5, max 20):

```ts
import { createPaymentLinksBatch } from '@fluxapay/sdk';
const { successful, failed } = await createPaymentLinksBatch(createLink, items, { concurrency: 10, continueOnError: true });
```
