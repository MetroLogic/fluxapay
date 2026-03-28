# Reverse Proxy Security Headers

FluxaPay backend now applies Helmet and CSP at the app layer. If you run behind Nginx, Cloudflare, ALB, or another reverse proxy, keep these headers intact.

## Required behavior

- Do not strip response headers set by the backend.
- Preserve these headers from upstream responses:
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `X-Frame-Options`
  - `Cross-Origin-Opener-Policy`
  - `Cross-Origin-Resource-Policy`

## TLS and forwarding requirements

- Terminate TLS at the proxy and always forward HTTPS traffic to clients.
- Send `X-Forwarded-Proto: https` so downstream services can reason about secure origin.
- Keep HSTS enabled in production and avoid overriding it at the proxy layer.

## CSP profile in backend

- API routes (`/api/v1/*` and `/health`) use a strict CSP:
  - `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`
- Docs route (`/api-docs`) uses a relaxed CSP required by Swagger UI scripts/styles.

## Nginx snippet (example)

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP $remote_addr;

# Avoid overwriting Helmet headers from app unless explicitly required.
proxy_pass_header Content-Security-Policy;
proxy_pass_header Strict-Transport-Security;
proxy_pass_header X-Content-Type-Options;
proxy_pass_header Referrer-Policy;
proxy_pass_header X-Frame-Options;
proxy_pass_header Cross-Origin-Opener-Policy;
proxy_pass_header Cross-Origin-Resource-Policy;
```
