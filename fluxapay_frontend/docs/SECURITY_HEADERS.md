# Frontend security headers

The frontend applies a fresh Content Security Policy nonce to each middleware
request. The middleware forwards the policy and `x-nonce` request header so
Next.js can add the nonce to its rendered scripts and styles. Responses also
receive the policy and the static security headers configured in `next.config.ts`.
Nonce-bearing pages must not be served from a shared cache with a different CSP
header.

## External origins

The policy allows only these external origins for the listed browser features:

| Origin | CSP directive | Purpose |
|---|---|---|
| `https://horizon.stellar.org` | `connect-src` | Stellar mainnet Horizon RPC |
| `https://horizon-testnet.stellar.org` | `connect-src` | Stellar testnet Horizon RPC |
| `https://*.ingest.sentry.io` | `connect-src` | Sentry event ingestion when the SDK does not use the same-origin `/monitoring` tunnel |
| `https://albedo.link` | `script-src` | Albedo browser wallet provider |
| WalletConnect API, relay, and secure origins | `connect-src` | Wallet connection and relay traffic |
| `https://checkout.fluxapay.com` | `frame-src` | Hosted checkout content |

The CSP keeps script execution nonce-based and does not allow inline script
attributes. Inline style attributes are permitted for compatibility with the
current React UI; inline `<style>` elements still require the per-request
nonce. Keep this exception limited to `style-src-attr` and do not add
`'unsafe-inline'` to `script-src` or `style-src`.

## Embedding and reporting

`X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` prevent other sites
from framing the application by default. To allow a known integration to frame
the application, set `CSP_FRAME_ANCESTORS` to a space-separated list of exact
HTTPS origins (for local development, `http://localhost[:port]` is accepted).
Wildcard hosts, paths, and non-HTTP schemes are ignored. Modern browsers use
`frame-ancestors` for the configured origins; older browsers continue to honor
the same-origin `X-Frame-Options` fallback.

Set `NEXT_PUBLIC_CSP_REPORT_URI` to an HTTPS endpoint to enable CSP violation
reports. Invalid or non-HTTPS report URLs are ignored.