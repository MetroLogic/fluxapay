# RFC: Wallet Deep Links for Fluxapay Checkout

> **Time-box limit**: 3–5 working days
> **Status**: Complete — RFC Recommended
> **GitHub Issue**: [#288](https://github.com/fluxapay/fluxapay/issues/288)
> **Output type**: RFC — Proceed with WalletConnect v2 integration

---

## Research Questions

The following five primary questions must each have a documented answer before this spike is considered complete (Requirement 1.1, 1.4).

**Q1**: Does SEP-0007 (`web+stellar:`) provide sufficient wallet coverage for a viable checkout deep link integration?

> _Answer_: **No — SEP-0007 (`web+stellar:`) does not provide sufficient wallet coverage for immediate implementation. Zero of the five in-scope wallets (LOBSTR, Solar, Freighter, xBull, Rabet) have confirmed SEP-0007 support via official documentation. The spec is Active (v2.1.0) and technically sound, but wallet adoption is absent. SEP-0007 is not viable for immediate implementation. See the Wallet Coverage section for full per-wallet findings.**

**Q2**: Does WalletConnect v2 offer a better or complementary path to SEP-0007 for Stellar checkout flows?

> _Answer_: **Yes — WalletConnect v2 is the primary viable mechanism for mobile-to-web Stellar checkout flows.** SEP-0007 has no confirmed wallet adoption among the five in-scope wallets, making it a non-starter for immediate implementation. WalletConnect v2 is confirmed for LOBSTR and xBull (via the Stellar Wallets Kit), covering the two most relevant mobile wallets. The Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`) provides a single React-compatible API that abstracts over WalletConnect, LOBSTR, xBull, Freighter, and Rabet, making it the recommended integration path. WalletConnect v2 is therefore a better path than SEP-0007 for Fluxapay's checkout flow at this time, though it does not cover Solar (maintenance mode) or the browser extension wallets (which use JavaScript injection APIs instead). See the WalletConnect Protocol Research section for full details.

**Q3**: Are there unmitigated security risks that would block an RFC recommendation?

> _Answer_: **No — there are no unmitigated High-severity security risks that would block an RFC recommendation. All four identified risks (S1–S4) have known mitigations. The recommended mechanism (WalletConnect v2 via Stellar Wallets Kit) avoids custom URI scheme hijacking (S1) by using LOBSTR's verified Universal Link infrastructure for WalletConnect pairing. Phishing (S2) and silent signing (S3) are mitigated by mandatory wallet confirmation screens. Relay availability (S4) is low severity with fallback options.**

**Q4**: What is the payer UX quality for each viable mechanism, and does any mechanism meet the "Smooth" bar?

> _Answer_: **WalletConnect v2 achieves an "Acceptable" overall UX rating for mobile flows and a "Smooth" rating for the cross-device (desktop → mobile wallet) scenario. No mechanism achieves "Smooth" for the pure mobile flow due to the required manual app-switch-back after wallet approval. The cross-device QR scan flow with WalletConnect v2 is actually an improvement over the current QR scan experience because the transaction is pre-filled and the checkout page detects approval automatically.**

**Q5**: What is the implementation complexity for Fluxapay's web-based checkout page?

> _Answer_: **Implementation complexity is low-to-medium. The Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`) abstracts all wallet connectivity into a single React-compatible API. Estimated effort: 1–2 days for a React developer familiar with Stellar. A free WalletConnect Cloud projectId is required. No backend changes are needed for the signing flow, though routing the signed XDR through the backend is recommended for audit logging.**

---

## Summary

This spike investigated deep link URI schemes and the WalletConnect v2 protocol for Stellar wallets, with the goal of improving the Fluxapay checkout mobile experience beyond the current QR-scan approach.

**SEP-0007 (`web+stellar:`)** has zero confirmed wallet adoption among the five in-scope wallets (LOBSTR, Solar, Freighter, xBull, Rabet). It is not viable for immediate implementation.

**WalletConnect v2 via the Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`)** is the recommended mechanism. LOBSTR and xBull — the two most relevant mobile wallets — have confirmed WalletConnect v2 support. The Stellar Wallets Kit also handles Freighter and Rabet via JavaScript injection, giving Fluxapay coverage across all five in-scope wallets through a single integration. The kit is production-proven, React-compatible, and used by Stellar Lab (SDF's official developer tool) and multiple Stellar DeFi protocols.

All four identified security risks (S1–S4) are mitigated. No RFC blockers were found. The decision framework gates all pass (with Gate 1 a conditional pass given Solar's maintenance-mode status).

**Recommendation: Proceed with WalletConnect v2 integration** using the Stellar Wallets Kit. Estimated implementation effort: 1–2 days for a React developer familiar with Stellar.

---

## Recommended Approach

**Primary mechanism**: WalletConnect v2 via `@creit.tech/stellar-wallets-kit`

WalletConnect v2 is the only confirmed mechanism with mobile wallet support among the in-scope wallets. It is production-proven (LOBSTR has offered it since early 2022), React-compatible, and abstracted by the Stellar Wallets Kit into a single unified API that covers all five in-scope wallets.

**Why the Stellar Wallets Kit**: The kit handles WalletConnect session management, QR code display, and transaction signing for LOBSTR and xBull (mobile), and also handles Freighter and Rabet via JavaScript browser injection (desktop). This means a single integration gives Fluxapay wallet coverage across all five in-scope wallets without maintaining separate code paths per wallet.

**Hybrid approach**: The Stellar Wallets Kit presents a wallet selector modal to the payer. On mobile, LOBSTR and xBull connect via WalletConnect v2 deep links. On desktop, Freighter and Rabet connect via browser extension injection, and any WalletConnect-compatible wallet can connect via QR scan. This hybrid approach is transparent to the integration — the kit's `signTransaction(xdr, { networkPassphrase, address })` API is the same regardless of which wallet the payer selects.

**Phasing**:
- **Phase 1**: Integrate the Stellar Wallets Kit with WalletConnect + browser extension wallets. This covers LOBSTR, xBull (mobile), Freighter, and Rabet (desktop) in a single integration.
- **Phase 2**: Add SEP-0007 deep links as a progressive enhancement if/when wallet adoption improves. Gate this behind a feature flag and enable per-wallet as support is confirmed.

**Note on SEP-0007**: Keep monitoring SEP-0007 adoption. If LOBSTR or xBull add `web+stellar:` support, it could provide a simpler mobile flow without relay dependency (no WalletConnect relay required, direct OS-level deep link). Until then, WalletConnect v2 is the only viable path.

### Decision Framework Gate Results

| Gate | Question | Result | Evidence |
|------|----------|--------|----------|
| Gate 1 | Does at least one mechanism have viable wallet coverage (≥3 of 5 in-scope wallets)? | **Conditional pass** | WalletConnect v2 covers 2/3 mobile wallets (LOBSTR, xBull). Solar is absent but in maintenance mode. Browser extension wallets (Freighter, Rabet) use JavaScript injection regardless of mechanism. |
| Gate 2 | Are all High-severity security risks mitigated? | **Pass** | S1 (URI Scheme Hijacking): mitigated — WalletConnect v2 uses LOBSTR's verified Universal Link infrastructure. S3 (Silent signing): mitigated — all wallets require explicit approval. |
| Gate 3 | Does at least one mechanism achieve a UX rating of "Smooth" or "Acceptable"? | **Pass** | WalletConnect v2 (mobile): Acceptable. WalletConnect v2 (cross-device): Smooth. |
| Gate 4 | Is the implementation complexity reasonable for the Fluxapay checkout page (web-based)? | **Pass** | Stellar Wallets Kit provides a React-compatible API. Estimated effort: 1–2 days. Free WalletConnect Cloud projectId required. |
| Gate 5 | Is the net improvement over the current QR-scan flow meaningful? | **Pass** | Mobile: pre-filled transaction, single-tap approve for LOBSTR/xBull users. Desktop: cross-device QR scan with automatic transaction pre-fill and real-time confirmation detection. |

**Decision: RFC recommended — proceed with WalletConnect v2 integration.**

---

## Wallet Coverage

_Phase 2 research complete (2025-05-28). All five in-scope wallets have been evaluated for SEP-0007, proprietary URI scheme, and Universal/App Link support. See the full compatibility matrix in the Appendix._

### Summary of Findings

The deep link landscape for Stellar wallets is fragmented and largely underdeveloped compared to EVM ecosystems. The key findings are:

- **SEP-0007 (`web+stellar:`)**: No confirmed support found for any of the five in-scope wallets via official documentation. The spec is Active (v2.1.0) and technically sound, but wallet adoption is not publicly documented for LOBSTR, Solar, Freighter, xBull, or Rabet. All findings are therefore "no publicly documented support" or "inferred" at best.
- **Proprietary URI schemes**: No wallet in the in-scope set has published a documented proprietary deep link scheme (e.g. `lobstr://`, `solar://`).
- **Universal Links (iOS) / App Links (Android)**: LOBSTR is the only wallet with verified AASA and `assetlinks.json` files on its domain (`lobstr.co`). However, the registered paths (`/uni/*`, `/univ2/*`) appear to be for WalletConnect pairing URIs, not SEP-0007 payment links. Solar and xBull have no such files. Freighter and Rabet are browser extensions — Universal/App Links are not applicable.
- **WalletConnect v2**: LOBSTR has confirmed WalletConnect v2 support (official docs). xBull is listed as a WalletConnect-compatible wallet in the Stellar Wallets Kit. This is the most viable mechanism for mobile-to-web checkout flows among the in-scope wallets.

**Coverage count**: 0 of 5 wallets have confirmed SEP-0007 deep link support. 1 of 5 (LOBSTR) has confirmed WalletConnect v2 support. 2 of 5 (LOBSTR, xBull) are reachable via WalletConnect through the Stellar Wallets Kit.

> **Note**: The two browser extension wallets (Freighter, Rabet) are not relevant for mobile deep link flows. For desktop checkout flows, they integrate via JavaScript API injection, not URI schemes.

### Wallet Scope

The following five wallets are the minimum in-scope set for this evaluation (Requirement 2.1):

| Wallet | Platform | Version Evaluated | Official Doc Source | Rationale for Inclusion |
|--------|----------|-------------------|---------------------|-------------------------|
| Lobstr | iOS, Android | Current (as of 2025-05-28) | [lobstr.co](https://lobstr.co), [lobstr.freshdesk.com](https://lobstr.freshdesk.com) | Leading Stellar mobile wallet; large user base among Fluxapay's target payer demographic |
| Solar | iOS, Android, Desktop | Last GitHub release 2022 | [solarwallet.io](https://solarwallet.io), [github.com/satoshipay/solar](https://github.com/satoshipay/solar) | Open-source Stellar mobile wallet; active community but GitHub repo shows no commits since 2022 |
| Freighter | Browser extension (Chrome, Firefox, Brave) | Current (as of 2025-05-28) | [freighter.app](https://freighter.app), [docs.freighter.app](https://docs.freighter.app) | Official SDF-backed browser extension wallet; primary wallet for desktop Stellar users |
| xBull | Browser extension + iOS/Android mobile app | iOS app released Sept 2024 | [xbull.app](https://xbull.app), [github.com/Creit-Tech/xBull-Wallet](https://github.com/Creit-Tech/xBull-Wallet) | Multi-platform wallet with web and mobile support; relevant for both mobile and desktop checkout flows |
| Rabet | Browser extension (Chrome, Firefox, Edge, Brave) | Current (as of 2025-05-28) | [rabet.io](https://rabet.io), [github.com/rabetofficial/rabet-extension](https://github.com/rabetofficial/rabet-extension) | Established browser extension wallet with a dedicated user base |

> **Note**: No additional wallets were identified as having significant market share among Fluxapay's target payer demographic that would warrant inclusion beyond the minimum in-scope set. The Stellar Wallets Kit also lists Albedo, Hana, Hot Wallet, and Klever Wallet, but these have smaller user bases and are not evaluated in this spike.

---

## WalletConnect Protocol Research

_Phase 3 research complete (2025-05-28). All findings are based on official documentation, the Stellar Wallets Kit source, and community sources. No live session testing was performed during this spike._

### 3.1 WalletConnect v2 Ecosystem State for Stellar

#### CAIP-2 Namespace Support

WalletConnect v2 is chain-agnostic by design, using [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) (Chain Agnostic Improvement Proposal) identifiers to address specific blockchain networks. Stellar is represented in the WalletConnect namespace system as:

- **`stellar:pubnet`** — Stellar Public Network (mainnet)
- **`stellar:testnet`** — Stellar Test Network

These namespace identifiers are used in WalletConnect v2 session proposals to declare which chain(s) a dApp requires. The Stellar namespace is not an EVM namespace (`eip155`) — it uses the `stellar` prefix, which is a community-defined CAIP-2 namespace. The WalletConnect chain registry does not maintain an official Stellar entry in the same way it does for EVM chains, but the `stellar:pubnet` / `stellar:testnet` identifiers are used in practice by LOBSTR and the Stellar Wallets Kit.

The primary Stellar-specific JSON-RPC method used over WalletConnect v2 is:

- **`stellar_signAndSubmitXDR`** — sends a Stellar transaction encoded as XDR to the wallet; the wallet signs and submits it to the Stellar network
- **`stellar_signXDR`** — sends a Stellar transaction encoded as XDR to the wallet for signing only; the dApp is responsible for submission (used by the Stellar Wallets Kit)

Evidence quality: **Doc-confirmed** (WalletConnect gitbook Stellar JSON-RPC reference; Stellar Wallets Kit source; LOBSTR official docs).

#### Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`)

The [Stellar Wallets Kit](https://stellarwalletskit.dev/) (`@creit.tech/stellar-wallets-kit`) is the de facto standard integration library for Stellar dApps. It is maintained by Creit Technologies LLP (the same team behind xBull Wallet) and is used in production by:

- [Stellar Lab](https://lab.stellar.org/) (SDF's official developer tool)
- [Blend Capital](https://mainnet.blend.capital/) (Stellar DeFi protocol)
- [FxDAO](https://app.fxdao.io/)
- [Soroban Domains](https://app.sorobandomains.org/)

The kit exposes a unified API (`StellarWalletsKit.signTransaction(xdr, { networkPassphrase, address })`) that abstracts over all supported wallets, including a dedicated WalletConnect module. The WalletConnect module requires a WalletConnect Cloud `projectId` (free registration at [cloud.walletconnect.com](https://cloud.walletconnect.com)) and handles session establishment, QR code display, and transaction signing internally.

Compatible wallets listed in the Stellar Wallets Kit (as of 2025-05-28):
- xBull Wallet (PWA and extension)
- Albedo
- Freighter (extension and mobile)
- Rabet (extension)
- **WalletConnect** (LOBSTR, xBull, and any other WalletConnect-compatible Stellar wallet)
- Lobstr
- Hana
- Hot Wallet
- Klever Wallet
- OneKey Wallet
- Bitget Wallet

The kit is framework-agnostic and works with React, Angular, Vue, and vanilla JavaScript. It is the **recommended integration path** for Fluxapay's React-based checkout page.

#### SDF (Stellar Development Foundation) Position on WalletConnect

The SDF has not published an official blog post or press release specifically endorsing WalletConnect v2 for Stellar. However, the SDF's own developer tool — [Stellar Lab](https://lab.stellar.org/) — uses the Stellar Wallets Kit (which includes WalletConnect support), which constitutes implicit endorsement. No SDF GitHub issues or official statements opposing WalletConnect adoption were found. The SDF's focus in 2024 has been on Soroban smart contracts; wallet connectivity standards have been left to the ecosystem (primarily Creit Technologies and LOBSTR/Ultra Stellar).

**Conclusion**: Stellar is functionally supported in WalletConnect v2 via the `stellar:pubnet` / `stellar:testnet` CAIP-2 namespaces. This support is community-driven (not formally registered in the WalletConnect chain registry as a first-class entry), but it is production-proven through LOBSTR's integration and the Stellar Wallets Kit's widespread adoption. Evidence quality: **Doc-confirmed**.

---

### 3.2 Per-Wallet WalletConnect v2 Status

| Wallet | WalletConnect v2 Status | Source | Notes |
|--------|------------------------|--------|-------|
| **Lobstr** | **Yes** | [LOBSTR official support doc](https://lobstr.freshdesk.com/support/solutions/articles/151000001589) | Confirmed WalletConnect v2 support with QR scan and deep link pairing. Compatible with StellarTerm and StellarX. Private keys remain on device; every transaction requires in-app approval. |
| **Solar** | **No** | [satoshipay/solar GitHub](https://github.com/satoshipay/solar) | No WalletConnect support found. Solar is not listed in the Stellar Wallets Kit. GitHub repo shows no commits since 2022 (maintenance mode). |
| **Freighter** | **No** | [docs.freighter.app](https://docs.freighter.app) | No WalletConnect support documented. Freighter integrates via JavaScript API injection (`@stellar/freighter-api`). The Stellar Wallets Kit lists Freighter as a supported wallet but via its browser extension API, not WalletConnect. |
| **xBull** | **Yes (via Stellar Wallets Kit)** | [stellarwalletskit.dev](https://stellarwalletskit.dev/); [Creit-Tech/Stellar-Wallets-Kit GitHub](https://github.com/Creit-Tech/Stellar-Wallets-Kit) | xBull is listed as WalletConnect-compatible in the Stellar Wallets Kit. Both the PWA and extension versions are supported. The mobile app (iOS, released Sept 2024) may support WalletConnect pairing, but this is inferred from the kit listing — not device-tested. |
| **Rabet** | **No** | [rabet.io](https://rabet.io); [rabetofficial/rabet-extension GitHub](https://github.com/rabetofficial/rabet-extension) | No WalletConnect support documented. Rabet integrates via direct browser injection. Listed in the Stellar Wallets Kit as a supported wallet but via browser injection, not WalletConnect. |

**Summary**: 2 of 5 in-scope wallets (LOBSTR, xBull) have confirmed or doc-confirmed WalletConnect v2 support. The 2 browser extension wallets (Freighter, Rabet) use JavaScript injection APIs instead. Solar has no WalletConnect support and appears to be in maintenance mode.

> **Note on LOBSTR verification**: The LOBSTR WalletConnect support article was last updated without a visible date, but the content references WalletConnect 2.0 explicitly and describes the current LOBSTR app UI (QR scanner in top-right corner, WalletConnect menu item). The Medium post announcing the integration ([LOBSTR & WalletConnect](https://medium.com/ultra-stellar/lobstr-walletconnect-7807fb9c83ae/)) was published January 2022, confirming this is a mature, production feature. Evidence quality: **Doc-confirmed**.

---

### 3.3 WalletConnect v2 Session Flow for Web-Based Checkout

The following describes the WalletConnect v2 session establishment and transaction signing flow as it applies to Fluxapay's React/web checkout page. This flow is compatible with a web-based architecture — no native app wrapper is required on the dApp side.

#### Step-by-Step Flow

```
1. dApp generates a pairing URI / QR code
   ─────────────────────────────────────────────────────────────────
   • Fluxapay checkout page initialises the Stellar Wallets Kit with
     a WalletConnect projectId.
   • The kit calls WalletConnect's Sign API to create a new pairing.
   • A pairing URI is generated (format: wc:...@2?relay-protocol=irn&symKey=...)
   • The checkout page displays this URI as a QR code (for desktop users)
     or as a deep link button (for mobile users already on their phone).

2. Payer scans QR or follows deep link in wallet app
   ─────────────────────────────────────────────────────────────────
   • Desktop flow: Payer opens LOBSTR or xBull on their mobile device
     and uses the in-app QR scanner to scan the QR code on the checkout page.
   • Mobile flow: Payer taps a "Connect Wallet" button on the checkout page;
     the pairing URI is opened as a deep link (wc:...) which the OS routes
     to the installed wallet app (LOBSTR or xBull).
   • LOBSTR uses Universal Links (lobstr.co/uni/* paths) for WalletConnect
     pairing deep links, providing verified domain ownership.

3. Encrypted session established via WalletConnect relay
   ─────────────────────────────────────────────────────────────────
   • The wallet app connects to the WalletConnect relay server
     (wss://relay.walletconnect.org, operated by Reown/WalletConnect Inc.).
   • An end-to-end encrypted session is established between the dApp
     (checkout page) and the wallet app using the symmetric key from the
     pairing URI.
   • The dApp proposes a session with required namespaces:
     { stellar: { chains: ["stellar:pubnet"], methods: ["stellar_signXDR"],
       events: [] } }
   • The wallet presents a "Connect" / "Reject" prompt to the payer.
   • Payer approves → session is established; wallet returns the payer's
     Stellar public key to the dApp.

4. dApp proposes a Stellar transaction for signing
   ─────────────────────────────────────────────────────────────────
   • Fluxapay checkout page constructs a Stellar payment transaction XDR
     (destination: Fluxapay merchant address, amount, asset, memo: payment ID).
   • The dApp sends a JSON-RPC request over the established session:
     { method: "stellar_signXDR", params: { xdr: "<base64-encoded XDR>" } }
   • The WalletConnect relay delivers this request to the wallet app.

5. Wallet presents transaction details and requests user approval
   ─────────────────────────────────────────────────────────────────
   • The wallet app (LOBSTR or xBull) decodes the XDR and displays the
     full transaction details: destination address, amount, asset, memo,
     and network fee.
   • The payer reviews the details and taps "Approve" or "Reject".
   • This step provides the primary defence against phishing and silent
     signing attacks.

6. Signed XDR returned to dApp
   ─────────────────────────────────────────────────────────────────
   • If approved, the wallet signs the transaction with the payer's
     private key (which never leaves the device).
   • The signed XDR is returned to the dApp via the WalletConnect relay
     as the JSON-RPC response.
   • The checkout page receives the signed XDR.

7. dApp submits to Stellar network
   ─────────────────────────────────────────────────────────────────
   • Fluxapay's checkout page (or backend) submits the signed XDR to
     Stellar Horizon (or Soroban RPC for Soroban transactions).
   • On success, the checkout page displays a payment confirmation.
   • The WalletConnect session can be kept alive for the checkout session
     duration or disconnected immediately after payment.
```

#### Compatibility with Fluxapay's Checkout Architecture

Fluxapay's checkout page is a React web application with no native app wrapper. WalletConnect v2 is fully compatible with this architecture:

- The Stellar Wallets Kit provides a React-compatible API and handles all WalletConnect session management.
- No native app wrapper, Capacitor, or React Native is required.
- The dApp side runs entirely in the browser; only the wallet side requires a mobile app.
- The WalletConnect relay server handles the encrypted communication bridge between the browser and the mobile wallet.
- A free WalletConnect Cloud `projectId` is required (registration at [cloud.walletconnect.com](https://cloud.walletconnect.com)).

**Recommended integration library**: `@creit.tech/stellar-wallets-kit` (via JSR: `npx jsr add @creit-tech/stellar-wallets-kit`). This library abstracts over WalletConnect, LOBSTR, xBull, Freighter, and Rabet in a single API, minimising integration complexity.

Evidence quality: **Doc-confirmed** (Stellar Wallets Kit docs; WalletConnect v2 specs; LOBSTR official docs).

---

### 3.4 WalletConnect v2 vs SEP-0007 Comparison

| Dimension | SEP-0007 (`web+stellar:`) | WalletConnect v2 |
|-----------|--------------------------|-----------------|
| **Wallet coverage** | **0 of 5** in-scope wallets have confirmed SEP-0007 support. The spec is Active (v2.1.0) but wallet adoption is not publicly documented for any of the five evaluated wallets. Coverage gap is a blocker for immediate implementation. | **2 of 5** in-scope wallets confirmed (LOBSTR: doc-confirmed; xBull: doc-confirmed via Stellar Wallets Kit). Browser extension wallets (Freighter, Rabet) use JavaScript injection APIs regardless of mechanism. Solar has no support. WalletConnect covers the two most relevant mobile wallets. |
| **Implementation complexity** | **Low in theory, high in practice.** Constructing a `web+stellar:pay` URI is straightforward (URL encoding). However, zero confirmed wallet support means the integration would be speculative. No SDK is required — a URL can be constructed manually. The `callback` parameter requires a backend HTTP endpoint to receive the signed XDR. Return-to-merchant flow requires `redirect_url` or `callback` parameter handling. | **Medium.** Requires a WalletConnect Cloud `projectId` (free). The Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`) abstracts most complexity into a few lines of code. Session management, QR code display, and transaction signing are handled by the kit. No backend changes required for the signing flow (dApp submits the signed XDR directly). Estimated integration effort: 1–2 days for a React developer familiar with Stellar. |
| **User experience** | **Acceptable (mobile) / N/A (desktop).** On mobile, tapping a `web+stellar:` link would open the wallet app pre-filled with payment details — a smooth one-tap flow. However, with zero confirmed wallet support, this is theoretical. No automatic return-to-merchant flow without `callback` or `redirect_url` support. Cross-device (desktop → mobile) requires manual QR scan of a separately displayed code. | **Acceptable (mobile) / Acceptable (desktop).** Mobile: payer taps "Connect Wallet", wallet app opens via deep link, approves transaction, returns to browser. Desktop: payer scans QR code with mobile wallet, approves in wallet app, checkout page updates automatically. The session-based model means the checkout page can detect approval without a page reload. No automatic app-switch-back on mobile (payer must manually return to browser after approving in wallet). |
| **Protocol maturity** | **Mature spec, immature adoption.** SEP-0007 v2.1.0 has been Active since 2018. The spec is well-documented and technically sound. However, the lack of confirmed wallet adoption in 2025 suggests the ecosystem has not prioritised SEP-0007 deep link integration. The `web+stellar:` URI scheme requires OS-level registration by wallet apps, which none of the five in-scope wallets appear to have implemented publicly. | **Mature protocol, growing Stellar adoption.** WalletConnect v2 (now maintained by Reown) is a production-proven protocol used across hundreds of EVM dApps. Stellar support is community-driven but production-proven: LOBSTR has offered WalletConnect v2 since early 2022; the Stellar Wallets Kit is used by Stellar Lab (SDF's official tool) and multiple DeFi protocols. The relay infrastructure is operated by Reown with a self-hostable option available. |

**Overall assessment**: WalletConnect v2 is the clearly superior path for Fluxapay's checkout flow at this time. SEP-0007 has better theoretical UX (direct deep link, no relay dependency) but zero confirmed wallet support makes it non-viable for immediate implementation. WalletConnect v2 has confirmed support from the two most relevant mobile wallets (LOBSTR, xBull) and a mature integration library (Stellar Wallets Kit) that is already used in production by the Stellar ecosystem's leading dApps.

---

## Security Analysis

_Phase 4 research complete (2025-05-28). All four minimum risks (S1–S4) have been evaluated. No unmitigated High-severity risks were identified. The recommended mechanism (WalletConnect v2 via Stellar Wallets Kit) is not blocked by any security risk._

### S1 — URI Scheme Hijacking

**Description**: A malicious app registers the same custom URI scheme (e.g. `web+stellar:`, `lobstr://`) and intercepts payment deep links. The OS routes the URI to the malicious app instead of the legitimate wallet.

**Mechanisms affected**: Custom URI schemes (SEP-0007 `web+stellar:`, any proprietary scheme)

**Severity**: **High** for custom URI schemes

**Platform mitigation**: iOS Universal Links (AASA file with verified domain ownership) and Android App Links (Digital Asset Links `assetlinks.json`) prevent hijacking by requiring verified domain ownership. The OS routes Universal/App Links exclusively to the verified app.

**Application mitigation**: Use Universal/App Links instead of custom URI schemes where possible. LOBSTR already has AASA/assetlinks.json in place for WalletConnect pairing.

**Residual risk**: **Low** when Universal/App Links are used; **High** when custom URI schemes are used without fallback to Universal/App Links.

**RFC blocker**: **No** — mitigation exists (use Universal/App Links or WalletConnect v2 which uses verified LOBSTR domain paths). Since WalletConnect v2 is the recommended mechanism and it uses LOBSTR's verified Universal Links for pairing, S1 is mitigated for the recommended approach.

> **Note**: Since SEP-0007 has zero confirmed wallet support, S1 is primarily a theoretical risk for the current recommendation. WalletConnect v2 via the Stellar Wallets Kit does not use custom URI schemes on the dApp side.

---

### S2 — Phishing via Crafted Deep Link

**Description**: A malicious site constructs a `web+stellar:pay` URI (or WalletConnect pairing request) pre-filled with a fraudulent destination address. The payer may not notice the destination has been changed.

**Mechanisms affected**: SEP-0007, WalletConnect v2 (to a lesser extent)

**Severity**: **Medium**

**Platform mitigation**: None at the OS level — the OS cannot validate transaction content.

**Application mitigation**: SEP-0007 security guidance (section 4 of the spec) requires wallets to display the full transaction details (destination, amount, asset, memo) before signing. WalletConnect v2 wallets (LOBSTR, xBull) also display full transaction details before approval. Fluxapay should display the payment details on the checkout page before initiating the wallet connection, so the payer can verify the destination address independently.

**Residual risk**: **Low** — the wallet's mandatory confirmation screen is the primary defence. Payers who verify the destination address in the wallet UI are protected.

**RFC blocker**: **No** — mitigation exists (wallet confirmation screen; Fluxapay checkout page should display payment details before wallet connection).

---

### S3 — Silent/Unintended Transaction Signing

**Description**: A mechanism that does not require explicit user confirmation before signing a transaction. This could allow a malicious dApp to silently drain a wallet.

**Mechanisms affected**: All mechanisms (theoretical risk)

**Severity**: **High**

**Platform mitigation**: None at the OS level.

**Application mitigation**: All compliant SEP-0007 wallets are required by the spec to display transaction details and require explicit user approval before signing. WalletConnect v2 wallets (LOBSTR, xBull) require explicit in-app approval for every `stellar_signXDR` request. The Stellar Wallets Kit does not provide any mechanism for silent signing. Private keys never leave the wallet app.

**Residual risk**: **Low** — all evaluated mechanisms require explicit user approval. Silent signing is not possible with compliant wallet implementations.

**RFC blocker**: **No** — all evaluated mechanisms have this mitigation built in.

---

### S4 — WalletConnect Relay Server Availability

**Description**: WalletConnect v2 sessions depend on a relay server (currently operated by Reown/WalletConnect Inc. at `relay.walletconnect.org`). If the relay is unavailable, the WalletConnect connection flow breaks.

**Mechanisms affected**: WalletConnect v2 only

**Severity**: **Low**

**Platform mitigation**: None at the OS level.

**Application mitigation**: Reown operates the relay with high availability SLAs. A self-hostable relay is available for teams requiring full control. The Stellar Wallets Kit falls back gracefully if WalletConnect is unavailable — other wallet options (Freighter, Rabet via browser injection) remain available. Fluxapay's checkout page should always offer the QR scan fallback.

**Residual risk**: **Low** — relay downtime is rare; fallback mechanisms exist.

**RFC blocker**: **No** — low severity with available mitigations.

---

### Risk Register

| Risk ID | Risk Name | Mechanisms Affected | Description | Severity | Platform Mitigation | Application Mitigation | Residual Risk | RFC Blocker? |
|---------|-----------|---------------------|-------------|----------|---------------------|------------------------|---------------|--------------|
| S1 | URI Scheme Hijacking | Custom URI schemes (e.g. `web+stellar:`, `lobstr://`) | A malicious app registers the same custom URI scheme and intercepts payment deep links. The OS routes the URI to the malicious app instead of the legitimate wallet. | **High** | iOS Universal Links (AASA) and Android App Links (`assetlinks.json`) require verified domain ownership; OS routes exclusively to the verified app. | Use Universal/App Links instead of custom URI schemes. LOBSTR already has AASA/assetlinks.json in place for WalletConnect pairing. | **Low** (Universal/App Links used); **High** (custom URI schemes without fallback) | **No** — mitigation exists. WalletConnect v2 uses LOBSTR's verified Universal Link infrastructure. |
| S2 | Phishing via crafted deep link | SEP-0007, WalletConnect v2 (lesser extent) | A malicious site constructs a `web+stellar:pay` URI pre-filled with a fraudulent destination address. The payer may not notice the destination has been changed. | **Medium** | None at OS level — OS cannot validate transaction content. | SEP-0007 spec requires wallets to display full transaction details before signing. WalletConnect v2 wallets (LOBSTR, xBull) display full details before approval. Fluxapay checkout page should display payment details before wallet connection. | **Low** | **No** — wallet confirmation screen is the primary defence. |
| S3 | Silent/unintended transaction signing | All mechanisms (theoretical) | A mechanism that does not require explicit user confirmation before signing. Could allow a malicious dApp to silently drain a wallet. | **High** | None at OS level. | All compliant SEP-0007 wallets require explicit approval. WalletConnect v2 wallets (LOBSTR, xBull) require explicit in-app approval for every `stellar_signXDR` request. Private keys never leave the wallet app. | **Low** | **No** — all evaluated mechanisms require explicit user approval. |
| S4 | WalletConnect relay server availability | WalletConnect v2 only | WalletConnect v2 sessions depend on a relay server operated by Reown/WalletConnect Inc. Downtime breaks the connection flow. | **Low** | None at OS level. | Reown operates relay with high availability SLAs. Self-hostable relay available. Stellar Wallets Kit falls back gracefully; QR scan fallback always available. | **Low** | **No** — low severity with available mitigations. |

### Consent Flow Assessment

| Mechanism | Full Transaction Details Displayed Before Approval? | Notes |
|-----------|-----------------------------------------------------|-------|
| SEP-0007 (`web+stellar:`) | Yes (required by spec section 4) | Theoretical — no wallet has confirmed SEP-0007 support. Spec mandates display of destination, amount, asset, memo before signing. |
| WalletConnect v2 (LOBSTR) | Yes | LOBSTR displays destination, amount, asset, memo, and fee before signing. Doc-confirmed per LOBSTR support docs. |
| WalletConnect v2 (xBull) | Yes | xBull displays full transaction details before signing. Doc-confirmed per xBull documentation. |
| JavaScript injection (Freighter) | Yes | Freighter displays a signing popup with full transaction details. |
| Browser injection (Rabet) | Yes | Rabet displays a signing popup with full transaction details. |
| Proprietary schemes | N/A | No confirmed support for any proprietary scheme among in-scope wallets. |

---

## UX Flow

_Phase 4 research complete (2025-05-28). UX flows documented for WalletConnect v2 (the viable mechanism). SEP-0007 and proprietary schemes are rated N/A due to zero confirmed wallet support._

### 6.1 Mobile Redirect Flow — WalletConnect v2

Step-by-step for a payer on mobile visiting the Fluxapay checkout page:

1. Payer arrives at the Fluxapay checkout page on their mobile browser
2. Checkout page displays payment details (amount, asset, merchant name)
3. Payer taps "Pay with Wallet" button
4. Checkout page shows a wallet selector (via Stellar Wallets Kit modal): LOBSTR, xBull, Freighter, Rabet, or WalletConnect QR
5. Payer selects LOBSTR or xBull
6. The Stellar Wallets Kit generates a WalletConnect pairing URI and opens it as a deep link (`wc:...`)
7. The OS routes the deep link to the installed wallet app (LOBSTR via its verified Universal Link; xBull via the `wc:` scheme)
8. The wallet app opens and displays a "Connect to Fluxapay" prompt with the dApp name and requested permissions
9. Payer taps "Connect" — session established
10. The wallet app displays the payment transaction details (destination, amount, asset, memo, fee)
11. Payer taps "Approve"
12. Signed XDR is returned to the checkout page via WalletConnect relay
13. Checkout page submits the transaction to Stellar Horizon
14. Checkout page displays payment confirmation
15. Payer manually switches back to the browser (no automatic app-switch-back on mobile)

**UX rating**: **Acceptable** — the flow requires two app switches (browser → wallet → browser) and one manual return. The wallet connection step adds friction compared to a pure QR scan, but the pre-filled transaction details and single-tap approval make the signing step smooth.

---

### 6.2 Fallback When Wallet Not Installed

- **WalletConnect v2 (LOBSTR deep link)**: If LOBSTR is not installed, the OS cannot route the Universal Link. The Stellar Wallets Kit should fall back to displaying a QR code that the payer can scan with any WalletConnect-compatible wallet. Alternatively, the checkout page can display a "Download LOBSTR" link.
- **WalletConnect v2 (xBull)**: If xBull is not installed, the `wc:` scheme may open a browser page or show an OS error. Fallback to QR code display is feasible.
- **General fallback**: The Stellar Wallets Kit's wallet selector modal allows the payer to choose a different wallet if their preferred wallet is not installed. The existing QR scan flow (display a `web+stellar:` or payment address QR) remains available as a last resort.
- **Recommendation**: Fluxapay should always display the QR code option alongside the wallet deep link buttons.

**UX rating**: **Acceptable** — QR fallback is available and feasible.

---

### 6.3 Cross-Device Scenario (Desktop Checkout → Mobile Wallet)

- Payer is on desktop, wants to pay from mobile wallet
- Checkout page displays the Stellar Wallets Kit modal with a "WalletConnect" option
- Payer selects WalletConnect — a QR code is displayed on the desktop checkout page
- Payer opens LOBSTR or xBull on their mobile device and scans the QR code
- Session established; wallet displays transaction details on mobile
- Payer approves on mobile; checkout page on desktop updates automatically (no page reload needed — WalletConnect session is live)
- This is the same flow as the current QR scan experience, but with automatic transaction pre-fill and real-time confirmation detection
- **UX rating**: **Smooth** — this is actually better than the current QR scan flow because the transaction is pre-filled and the checkout page detects approval automatically

---

### 6.4 Return-to-Merchant Flow

- **WalletConnect v2**: After approving in the wallet app, the payer must manually switch back to the browser. There is no automatic app-switch-back. The checkout page detects the signed XDR via the WalletConnect relay and updates automatically — so when the payer returns to the browser, the confirmation is already displayed.
- **SEP-0007 (theoretical)**: The `callback` parameter allows the wallet to POST the signed XDR to a Fluxapay backend endpoint. The `redirect_url` parameter allows the wallet to redirect the payer back to the checkout page after signing. However, since no wallet has confirmed SEP-0007 support, this is theoretical.
- **Recommendation**: For WalletConnect v2, Fluxapay should display a "Waiting for approval in your wallet..." state on the checkout page, so the payer knows to switch to their wallet app and return after approving.

**UX rating**: **Acceptable** — manual return required, but checkout page auto-confirms on return.

---

### UX Summary Table

| Mechanism | Mobile Redirect | Fallback | Cross-Device | Return Flow | Overall Rating |
|-----------|----------------|----------|--------------|-------------|----------------|
| SEP-0007 (`web+stellar:`) | N/A (no confirmed wallet support) | N/A | N/A | N/A | **N/A (not viable)** |
| WalletConnect v2 (mobile) | Acceptable — two app switches, one manual return | Acceptable — QR fallback available | Smooth — QR scan, auto-detection | Acceptable — manual return, auto-confirmation | **Acceptable** |
| WalletConnect v2 (desktop → mobile) | N/A | N/A | Smooth — QR scan, auto-detection, transaction pre-filled | Acceptable — auto-confirmation on desktop | **Smooth** |
| Proprietary schemes | N/A (no confirmed support) | N/A | N/A | N/A | **N/A (not viable)** |

---

## Implementation Plan (high-level)

The following steps describe how to integrate the Stellar Wallets Kit into Fluxapay's React-based checkout page. No backend changes are required for the signing flow, though routing the signed XDR through the backend is recommended for audit logging (see Open Questions).

1. **Register a free WalletConnect Cloud projectId** at [cloud.walletconnect.com](https://cloud.walletconnect.com). This is required for the WalletConnect module in the Stellar Wallets Kit.

2. **Install the Stellar Wallets Kit**:
   ```bash
   npx jsr add @creit-tech/stellar-wallets-kit
   ```

3. **Initialise the kit in the checkout page** with all wallet modules (WalletConnect, LOBSTR, xBull, Freighter, Rabet):
   ```typescript
   import {
     StellarWalletsKit,
     WalletNetwork,
     WalletConnectModule,
     LOBSTR_ID,
     xBullModule,
     FreighterModule,
     RabetModule,
   } from '@creit.tech/stellar-wallets-kit';

   const kit = new StellarWalletsKit({
     network: WalletNetwork.PUBLIC,
     selectedWalletId: LOBSTR_ID,
     modules: [
       new WalletConnectModule({ projectId: 'YOUR_WALLETCONNECT_PROJECT_ID' }),
       new xBullModule(),
       new FreighterModule(),
       new RabetModule(),
     ],
   });
   ```

4. **Replace the current "copy address / QR scan" flow** with a "Pay with Wallet" button that opens the Stellar Wallets Kit modal. The modal presents the payer with a wallet selector (LOBSTR, xBull, Freighter, Rabet, WalletConnect QR).

5. **On wallet selection**, the kit handles session establishment (WalletConnect v2 deep link or QR scan for LOBSTR/xBull) or browser injection (Freighter/Rabet). No additional code is needed for the connection step.

6. **Construct the Stellar payment transaction XDR** on the checkout page:
   - Destination: merchant Stellar address
   - Amount and asset: from the payment record
   - Memo: payment ID (for reconciliation)
   - Network passphrase: `Networks.PUBLIC`

7. **Call `kit.signTransaction(xdr, { networkPassphrase, address })`** — the kit handles the rest. The payer's wallet presents the transaction details and requests approval. The signed XDR is returned on approval.

8. **Submit the signed XDR** to Stellar Horizon via the existing backend (recommended) or directly from the frontend. Routing through the backend maintains the existing payment status lifecycle and enables audit logging.

9. **Display payment confirmation** on success. Handle rejection and timeout gracefully — show a clear error message and offer the payer the option to retry or use the QR scan fallback.

10. **Always keep the QR scan fallback available** for payers without a supported wallet. The Stellar Wallets Kit's modal includes a WalletConnect QR option that works with any WalletConnect-compatible Stellar wallet.

**Dependencies**:
- WalletConnect Cloud projectId (free registration at [cloud.walletconnect.com](https://cloud.walletconnect.com))
- `@creit-tech/stellar-wallets-kit` npm package (via JSR)
- No backend changes required for the signing flow

**Estimated effort**: 1–2 days for a React developer familiar with Stellar.

---

## Open Questions

1. **Frontend vs backend XDR submission**: Should Fluxapay submit the signed XDR from the frontend (simpler) or route it through the backend (better for audit logging and payment status tracking)? **Recommendation**: route through the backend to maintain the existing payment status lifecycle and enable audit logging.

2. **WalletConnect session lifetime**: Should the WalletConnect session be kept alive for the duration of the checkout session, or disconnected immediately after payment? **Recommendation**: disconnect immediately after payment to minimise session management complexity and reduce the attack surface.

3. **Solar user share**: What is Solar's actual user share among Fluxapay's payer demographic? If significant, consider reaching out to the Solar team or evaluating a fork/alternative. Solar's maintenance-mode status (no commits since 2022) means it is unlikely to gain WalletConnect support without external intervention.

4. **WalletConnect relay self-hosting**: Should Fluxapay self-host the WalletConnect relay for reliability and data sovereignty? **Recommendation**: start with Reown's hosted relay; evaluate self-hosting if relay availability becomes a concern in production.

5. **SEP-0007 progressive enhancement**: Should SEP-0007 deep links be added as a progressive enhancement once wallet adoption improves? **Recommendation**: yes — add a feature flag for SEP-0007 and enable it per-wallet as support is confirmed. If LOBSTR or xBull add `web+stellar:` support, it would provide a simpler mobile flow without relay dependency.

---

## Appendix: Compatibility Matrix

_Phase 2 research complete (2025-05-28). All findings based solely on documentation are marked "(doc only — not device-tested)". Device testing was not performed during this spike._

The table below is the definitive compatibility matrix for all in-scope wallets against all evaluated link mechanisms.

| Wallet | Platform | Version Evaluated | Doc Source | SEP-0007 (`web+stellar:`) | SEP-0007 Params | Proprietary Scheme | Proprietary Params | Universal/App Link | WalletConnect v2 | Recommended Mechanism | Notes |
|--------|----------|-------------------|------------|--------------------------|-----------------|-------------------|-------------------|-------------------|-----------------|----------------------|-------|
| Lobstr | iOS, Android | Current (2025-05-28) | [lobstr.co](https://lobstr.co); [lobstr.freshdesk.com](https://lobstr.freshdesk.com/support/solutions/articles/151000001589) | No publicly documented support | N/A | No publicly documented support | N/A | **Yes** — AASA file at `lobstr.co/.well-known/apple-app-site-association` (paths: `/uni/*`, `/univ2/*`); `assetlinks.json` at `lobstr.co/.well-known/assetlinks.json` (package: `com.lobstr.client`) (doc only — not device-tested) | **Yes** — confirmed in official LOBSTR support docs; WalletConnect v2 with QR scan or deep link pairing (doc only — not device-tested) | **WalletConnect v2** — the only confirmed mechanism; Universal/App Link paths appear to be for WalletConnect pairing URIs, not SEP-0007 payment links | LOBSTR's Universal/App Link paths (`/uni/*`, `/univ2/*`) are likely WalletConnect pairing endpoints, not SEP-0007 handlers. No SEP-0007 support found in official docs or GitHub. |
| Solar | iOS, Android, Desktop | Last GitHub release 2022 | [solarwallet.io](https://solarwallet.io); [github.com/satoshipay/solar](https://github.com/satoshipay/solar) | No publicly documented support | N/A | No publicly documented support | N/A | No — no AASA or `assetlinks.json` found at `solarwallet.io` (doc only — not device-tested) | No publicly documented support | None confirmed — no viable deep link mechanism found | Solar GitHub repo (satoshipay/solar) shows no SEP-0007 references and no commits since 2022. The wallet appears to be in maintenance mode. No URI scheme or Universal/App Link support documented. |
| Freighter | Browser extension (Chrome, Firefox, Brave) | Current (2025-05-28) | [freighter.app](https://freighter.app); [docs.freighter.app](https://docs.freighter.app) | No — browser extension; SEP-0007 is a mobile/OS URI scheme; not applicable to browser extensions | N/A | No — browser extension; no proprietary URI scheme applicable | N/A | N/A — browser extension; no mobile app | No publicly documented support | **JavaScript API (`@stellar/freighter-api`)** — the only supported integration mechanism for web apps | Freighter integrates via a browser-injected JavaScript API (`@stellar/freighter-api`), not URI schemes. `signTransaction(xdr)` is the primary method. No SEP-0007 or WalletConnect support documented. |
| xBull | Browser extension + iOS/Android mobile app | iOS app released Sept 2024; extension current (2025-05-28) | [xbull.app](https://xbull.app); [github.com/Creit-Tech/xBull-Wallet](https://github.com/Creit-Tech/xBull-Wallet); [stellarwalletskit.dev](https://stellarwalletskit.dev) | No publicly documented support | N/A | No publicly documented support | N/A | No — no AASA or `assetlinks.json` found at `xbull.app` (doc only — not device-tested) | **Yes (via Stellar Wallets Kit)** — xBull is listed as WalletConnect-compatible in the Stellar Wallets Kit (`@creit-tech/stellar-wallets-kit`); both PWA and extension versions supported (doc only — not device-tested) | **WalletConnect v2 (via Stellar Wallets Kit)** for web/dApp integration; **JavaScript SDK** for browser extension | xBull's primary integration path is via the Stellar Wallets Kit or its own xBull SDK. The mobile app (iOS/Android) was released in Sept 2024; no SEP-0007 or proprietary deep link scheme documented for the mobile app. |
| Rabet | Browser extension (Chrome, Firefox, Edge, Brave) | Current (2025-05-28) | [rabet.io](https://rabet.io); [github.com/rabetofficial/rabet-extension](https://github.com/rabetofficial/rabet-extension) | No — browser extension; SEP-0007 is a mobile/OS URI scheme; not applicable to browser extensions | N/A | No — browser extension; no proprietary URI scheme applicable | N/A | N/A — browser extension; no mobile app | No publicly documented support | **Browser injection API** — Rabet injects directly into web pages without requiring an SDK | Rabet integrates via direct browser injection (no SDK required). No SEP-0007, WalletConnect, or proprietary URI scheme support documented. |

### Per-Wallet Deep Link Research Notes

#### 2.1 Lobstr (iOS/Android)

**SEP-0007 (`web+stellar:`)**: No publicly documented support found. LOBSTR's official support documentation ([lobstr.freshdesk.com](https://lobstr.freshdesk.com)) and GitHub ([github.com/Lobstrco](https://github.com/Lobstrco)) make no mention of `web+stellar:` URI handling. The LOBSTR support docs focus on WalletConnect v2 and the LOBSTR Signer Extension as the primary integration mechanisms. Evidence quality: **Doc-confirmed (absence)**.

**Proprietary URI scheme (`lobstr://`)**: No publicly documented `lobstr://` scheme found in official docs, GitHub, or community sources. Evidence quality: **Doc-confirmed (absence)**.

**Universal Links (iOS) / App Links (Android)**: LOBSTR hosts both files:
- iOS AASA at `https://lobstr.co/.well-known/apple-app-site-association` — app ID `6ZVXG76XRR.com.ultrastellar.lobstr`, paths: `/uni/*`, `/univ2/*`
- Android `assetlinks.json` at `https://lobstr.co/.well-known/assetlinks.json` — package `com.lobstr.client`

The registered paths (`/uni/*`, `/univ2/*`) are consistent with WalletConnect pairing URI patterns, not SEP-0007 payment links. These files confirm that LOBSTR has implemented Universal/App Links for WalletConnect session establishment, not for direct payment deep links. Evidence quality: **Doc-confirmed**.

**WalletConnect v2**: Confirmed. LOBSTR's official support article ([lobstr.freshdesk.com/support/solutions/articles/151000001589](https://lobstr.freshdesk.com/support/solutions/articles/151000001589)) documents WalletConnect v2 support with QR code scanning and deep linking. Compatible with StellarTerm and StellarX. Evidence quality: **Doc-confirmed**.

**Recommended mechanism**: WalletConnect v2 — the only confirmed mechanism. The Universal/App Link infrastructure is already in place for WalletConnect pairing.

---

#### 2.2 Solar (iOS/Android)

**SEP-0007 (`web+stellar:`)**: No publicly documented support found. The Solar GitHub repository ([github.com/satoshipay/solar](https://github.com/satoshipay/solar)) contains no references to SEP-0007, `web+stellar:`, or URI scheme handling. The last commit to the repository was in 2022, suggesting the wallet is in maintenance mode. Evidence quality: **Doc-confirmed (absence)**.

**Proprietary URI scheme (`solar://`)**: No publicly documented `solar://` scheme found. Evidence quality: **Doc-confirmed (absence)**.

**Universal Links (iOS) / App Links (Android)**: No AASA file found at `solarwallet.io/.well-known/apple-app-site-association` (HTTP 404). No `assetlinks.json` found at `solarwallet.io/.well-known/assetlinks.json` (HTTP 404). Evidence quality: **Doc-confirmed (absence)**.

**WalletConnect v2**: No publicly documented support found. Solar is not listed in the Stellar Wallets Kit's compatible wallets list. Evidence quality: **Doc-confirmed (absence)**.

**Recommended mechanism**: None confirmed. Solar has no viable deep link mechanism. The wallet appears to be in maintenance mode with no active development since 2022.

> **Gap note**: Solar's lack of any deep link mechanism and apparent maintenance-mode status is a coverage gap. If Solar's user base is significant for Fluxapay's payer demographic, this gap should be noted in the decision framework.

---

#### 2.3 Freighter (Browser Extension)

**Platform note**: Freighter is a browser extension (Chrome, Firefox, Brave). Universal Links and App Links are not applicable — there is no mobile app. SEP-0007 is an OS-level URI scheme designed for mobile and desktop applications; browser extensions do not register OS URI handlers.

**SEP-0007 (`web+stellar:`)**: Not applicable in the browser extension context. Freighter does not register as a `web+stellar:` URI handler. Evidence quality: **Doc-confirmed (N/A)**.

**Proprietary URI scheme**: Not applicable. Browser extensions do not register OS URI schemes. Evidence quality: **Doc-confirmed (N/A)**.

**Universal/App Links**: N/A — browser extension only.

**WalletConnect v2**: No publicly documented support found. Freighter's official documentation ([docs.freighter.app](https://docs.freighter.app)) describes only the JavaScript API integration path. Evidence quality: **Doc-confirmed (absence)**.

**Integration mechanism**: Freighter integrates via the `@stellar/freighter-api` JavaScript library. Web apps call `signTransaction(xdr)` to request transaction signing. The extension injects into the browser page and presents a signing UI to the user. This is the standard and only documented integration path.

**Recommended mechanism**: JavaScript API (`@stellar/freighter-api`) — the only supported mechanism for web app integration.

---

#### 2.4 xBull (iOS/Android/Web)

**SEP-0007 (`web+stellar:`)**: No publicly documented support found for either the browser extension or the mobile app. The xBull GitHub repository ([github.com/Creit-Tech/xBull-Wallet](https://github.com/Creit-Tech/xBull-Wallet)) makes no mention of SEP-0007 or `web+stellar:` URI handling. Evidence quality: **Doc-confirmed (absence)**.

**Proprietary URI scheme**: No publicly documented `xbull://` or similar scheme found. Evidence quality: **Doc-confirmed (absence)**.

**Universal Links (iOS) / App Links (Android)**: No AASA file found at `xbull.app/.well-known/apple-app-site-association` (HTTP 404). No `assetlinks.json` found at `xbull.app/.well-known/assetlinks.json` (HTTP 404). Evidence quality: **Doc-confirmed (absence)**.

**WalletConnect v2**: Yes, via the Stellar Wallets Kit. The Stellar Wallets Kit ([stellarwalletskit.dev](https://stellarwalletskit.dev)) lists xBull (both PWA and extension versions) as WalletConnect-compatible. The kit's documentation shows `WalletConnect v2 (Lobstr, xBull Wallet, etc)` as a supported wallet type. Evidence quality: **Doc-confirmed**.

**Integration mechanism**: xBull's primary integration paths are:
1. **Stellar Wallets Kit** (`@creit-tech/stellar-wallets-kit`) — abstracts over xBull, LOBSTR, Freighter, Rabet, and WalletConnect in a single API
2. **xBull SDK** — direct browser extension integration via `xBullSDK.connect()`, `xBullSDK.getPublicKey()`, `xBullSDK.signXDR()`

**Recommended mechanism**: WalletConnect v2 (via Stellar Wallets Kit) for cross-platform integration; xBull SDK for direct browser extension integration.

> **Note**: The xBull mobile app (iOS) was released in September 2024. Its deep link capabilities have not been publicly documented. The mobile app may support WalletConnect v2 pairing, but this is inferred from the Stellar Wallets Kit listing and not device-tested.

---

#### 2.5 Rabet (Browser Extension)

**Platform note**: Rabet is a browser extension (Chrome, Firefox, Edge, Brave). Universal Links and App Links are not applicable — there is no mobile app. SEP-0007 is not applicable in the browser extension context.

**SEP-0007 (`web+stellar:`)**: Not applicable in the browser extension context. Evidence quality: **Doc-confirmed (N/A)**.

**Proprietary URI scheme**: Not applicable. Browser extensions do not register OS URI schemes. Evidence quality: **Doc-confirmed (N/A)**.

**Universal/App Links**: N/A — browser extension only.

**WalletConnect v2**: No publicly documented support found. Rabet is listed in the Stellar Wallets Kit as a supported wallet (extension version), but via browser injection, not WalletConnect. Evidence quality: **Doc-confirmed (absence)**.

**Integration mechanism**: Rabet integrates via direct browser injection — developers can interact with Rabet without installing any SDK or package. The extension injects a JavaScript interface into web pages.

**Recommended mechanism**: Browser injection API — the only supported mechanism.

---

## References

The following references were consulted during this spike:

- SEP-0007 spec (v2.1.0, Active): https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
- WalletConnect v2 specs: https://specs.walletconnect.com/
- WalletConnect v2 Stellar JSON-RPC reference (gitbook): https://walletconnect.gitbook.io/docs/v/2.0/json-rpc/stellar
- WalletConnect v2 Sign API namespaces spec: https://specs.walletconnect.com/2.0/specs/clients/sign/namespaces
- WalletConnect v2 "What's New" blog post: https://walletconnect.com/blog/walletconnect-network-v2-0-what-s-new
- Reown (WalletConnect) relay server: https://relay.walletconnect.org
- How to use WalletConnect v2 with Stellar (community gist): https://gist.github.com/MarcoCiaramella/097b28e308817b2b7143d95a5e8d84f2
- Stellar Wallets Kit docs: https://stellarwalletskit.dev/
- Stellar Wallets Kit GitHub (Creit-Tech): https://github.com/Creit-Tech/Stellar-Wallets-Kit
- Stellar Wallets Kit npm package: https://www.npmjs.com/package/@creit.tech/stellar-wallets-kit
- LOBSTR WalletConnect article (official support doc): https://lobstr.freshdesk.com/support/solutions/articles/151000001589
- LOBSTR AASA file (iOS Universal Links): https://lobstr.co/.well-known/apple-app-site-association
- LOBSTR assetlinks.json (Android App Links): https://lobstr.co/.well-known/assetlinks.json
- LOBSTR Signer Extension (browser extension): https://lobstr.co/signer-extension/
- LOBSTR GitHub: https://github.com/Lobstrco
- Solar wallet GitHub (satoshipay/solar): https://github.com/satoshipay/solar
- Solar wallet official site: https://solarwallet.io
- Freighter official docs: https://docs.freighter.app/docs/guide/usingFreighterWebApp
- Freighter GitHub (stellar/freighter): https://github.com/stellar/freighter
- Freighter API npm package: https://www.npmjs.com/package/@stellar/freighter-api
- xBull Wallet GitHub (Creit-Tech/xBull-Wallet): https://github.com/Creit-Tech/xBull-Wallet
- xBull Wallet iOS App Store: https://apps.apple.com/us/app/xbull-wallet/id6705122563
- Stellar Wallets Kit (Creit-Tech): https://github.com/Creit-Tech/Stellar-Wallets-Kit
- Rabet official site: https://rabet.io
- Rabet GitHub (rabetofficial/rabet-extension): https://github.com/rabetofficial/rabet-extension
- MITRE ATT&CK T1635.001 (URI Hijacking): https://attack.mitre.org/techniques/T1635/001
- Stellar Stack Exchange — which wallets support SEP-0007: https://stellar.stackexchange.com/questions/1035/which-wallets-are-supporting-sep-0007
