# Checkout widget under a strict Content Security Policy

The embeddable checkout widget (`/fluxapay-widget.js`) injects a stylesheet and
an `<iframe>` into your page. If your site sends a `Content-Security-Policy`
header — and a payment page should — the browser will block anything the widget
injects unless it can prove the content came from you.

This guide covers what to allow and how to pass the widget a nonce.

## Quick start

Generate a fresh nonce per request, put it in your CSP header, and pass the same
value to the widget on its `<script>` tag:

```html
<script
  src="https://cdn.fluxapay.com/fluxapay-widget.js"
  data-nonce="{{ cspNonce }}"
></script>
```

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{{ cspNonce }}' https://cdn.fluxapay.com;
  style-src 'self' 'nonce-{{ cspNonce }}';
  frame-src https://checkout.fluxapay.com;
  connect-src https://api.fluxapay.com;
```

A nonce **must be regenerated for every response** and must be unguessable. A
nonce reused across responses, or baked into a cached page, provides no
protection at all — an attacker who can read one page can then inject scripts
that the policy will happily execute.

## What the widget does with the nonce

- Reads `data-nonce` from its own `<script>` tag at load time, via
  `document.currentScript`.
- Applies it to the single `<style id="fluxapay-widget-styles">` element it
  injects, and to any `<script>` or `<style>` it creates thereafter.
- Exposes the resolved value as `FluxaPay.nonce`, and a helper
  `FluxaPay.createNoncedElement(tagName)` if your own integration code needs to
  inject elements alongside the widget.

Without a nonce the widget still works — it simply injects unnonced elements,
which is fine on a page with no CSP or one allowing `'unsafe-inline'`.

## Why `style-src` needs the nonce, not `'unsafe-inline'`

The widget used to set styles with `element.style.cssText = ...`. Those are
inline style *attributes*, and **a nonce cannot whitelist a style attribute** —
CSP nonces only apply to `<style>` and `<script>` elements. Under a strict
`style-src` the widget therefore rendered completely unstyled no matter how the
page was configured.

All of its styling now lives in one nonced `<style>` element and the elements
carry class names, so a strict policy works as intended. You do not need
`'unsafe-inline'` in `style-src`, and you should not add it: it re-enables
exactly the injection vector the policy exists to close.

## Loading the widget asynchronously

`document.currentScript` is null when a script is injected by a loader rather
than parsed from the document. The widget falls back, in order, to:

1. `<script data-fluxapay-widget data-nonce="...">` — mark your tag with
   `data-fluxapay-widget` if you inject it dynamically.
2. Any `<script>` whose `src` contains `fluxapay-widget` or `widget.js` and
   which carries a `data-nonce`.
3. `window.FLUXAPAY_CSP_NONCE`, if you would rather set it as a global before
   loading the widget.

```html
<script nonce="{{ cspNonce }}">
  window.FLUXAPAY_CSP_NONCE = "{{ cspNonce }}";
</script>
<script src="https://cdn.fluxapay.com/fluxapay-widget.js" async></script>
```

## Directives explained

| Directive | Needs | Why |
|---|---|---|
| `script-src` | your CDN origin + `'nonce-…'` | Loads the widget itself. |
| `style-src` | `'nonce-…'` | The widget's injected stylesheet. |
| `frame-src` | the FluxaPay checkout origin | Checkout renders in an iframe. |
| `connect-src` | the FluxaPay API origin | Only if your own code calls the API. |

`img-src` is not required by the widget itself; the checkout iframe carries its
own policy for anything it loads.

## Verifying

Open the page with DevTools on and confirm the console shows **no**
`Refused to apply inline style` or `Refused to load the script` messages, and
that the modal renders styled. To catch violations in production without
breaking checkout, roll the policy out with
`Content-Security-Policy-Report-Only` and a `report-uri` first.

## Troubleshooting

**The modal appears but is unstyled.** The nonce did not reach the widget.
Check `FluxaPay.nonce` in the console — if it is `null`, the `data-nonce`
attribute is missing or the script was injected asynchronously (see above).

**`Refused to apply inline style … 'unsafe-inline'` .** Something other than the
widget is setting inline styles — the widget no longer does.

**The nonce is present but still refused.** The nonce in the header and the one
on the tag have diverged, usually because the HTML was cached after the header
was regenerated. Make sure pages carrying a nonce are not cached.
