# Implementation Plan: PWA Manifest & Icons

## Overview

Implement PWA support for the FluxaPay merchant dashboard by adding a static `manifest.json`, generating PNG icon assets from the existing SVG logo, wiring the manifest and icons into the Next.js Metadata API via `baseMetadata`, and optionally adding a production-only service worker. All changes are in `fluxapay_frontend/`.

## Tasks

- [x] 1. Install Sharp and add the icon generation script
  - Add `sharp` as a `devDependency` in `fluxapay_frontend/package.json`
  - Create `fluxapay_frontend/scripts/generate-pwa-icons.ts` that reads `public/assets/logo.svg`, rasterises it at each target size with `#2E3539` background fill, and writes the PNGs to `public/` and `public/icons/`
  - Target sizes: 192×192 → `public/icons/icon-192x192.png`, 512×512 → `public/icons/icon-512x512.png`, 180×180 → `public/apple-touch-icon.png`, 32×32 → `public/favicon-32x32.png`, 16×16 → `public/favicon-16x16.png`
  - Add a `"generate-pwa-icons"` npm script: `"tsx scripts/generate-pwa-icons.ts"`
  - Run the script to produce the PNG files
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Create the web app manifest
  - [x] 2.1 Create `fluxapay_frontend/public/manifest.json` with all required fields
    - `name`: `"FluxaPay"`, `short_name`: `"FluxaPay"`, `description`: merchant dashboard description
    - `start_url`: `"/"`, `display`: `"standalone"`, `orientation`: `"portrait-primary"`
    - `theme_color`: `"#FED449"`, `background_color`: `"#2E3539"`
    - `icons` array with the 192×192 and 512×512 entries, each with `"purpose": "any maskable"`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.2_

  - [ ]* 2.2 Write unit tests for manifest structure
    - Create `fluxapay_frontend/src/__tests__/pwa/manifest.test.ts`
    - Parse `public/manifest.json` and assert all required fields match the spec (name, short_name, description, start_url, display, theme_color, background_color, orientation, non-empty icons array)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [ ]* 2.3 Write unit tests for icon file existence
    - Create `fluxapay_frontend/src/__tests__/pwa/icon-files.test.ts`
    - Assert each expected PNG file exists on disk at the correct path
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 3. Update `baseMetadata` in `src/lib/seo.ts`
  - [x] 3.1 Add PWA metadata fields to `baseMetadata`
    - Add `manifest: "/manifest.json"`
    - Add `icons` field declaring `apple: "/apple-touch-icon.png"` and standard favicons at `/favicon-32x32.png` (32×32) and `/favicon-16x16.png` (16×16)
    - Add `themeColor` array: `{ media: "(prefers-color-scheme: light)", color: "#FED449" }` and `{ media: "(prefers-color-scheme: dark)", color: "#2E3539" }`
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

  - [ ]* 3.2 Write unit tests for `baseMetadata` PWA fields
    - Create `fluxapay_frontend/src/__tests__/pwa/seo-pwa.test.ts`
    - Import `baseMetadata` from `src/lib/seo.ts` and assert `manifest`, `icons`, and `themeColor` fields are present with correct values
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run `npm test` in `fluxapay_frontend/` and confirm all existing and new tests pass. Ask the user if any questions arise.

- [x] 5. Implement the `ManifestIcon` validator and property-based tests
  - [x] 5.1 Create `fluxapay_frontend/src/lib/pwa-utils.ts` with the `isValidManifestIcon` helper
    - Export `isValidManifestIcon(icon: unknown): boolean` — returns `true` when `src`, `sizes`, and `type` are all non-empty strings
    - Export the `ManifestIcon` and `WebAppManifest` TypeScript interfaces from the design document
    - _Requirements: 1.10_

  - [ ]* 5.2 Write property test for icon entry structural completeness (Property 1)
    - Create `fluxapay_frontend/src/__tests__/pwa/pwa.property.test.ts`
    - Use `fast-check` to assert that `isValidManifestIcon` returns `true` for any record with non-empty `src`, `sizes`, and `type` strings (minimum 100 runs)
    - **Property 1: Icon entry structural completeness**
    - **Validates: Requirements 1.10**

- [x] 6. Implement the service worker registration client component
  - [x] 6.1 Create `fluxapay_frontend/src/app/sw-register.tsx`
    - `"use client"` component using `useEffect` to call `navigator.serviceWorker.register("/sw.js")` only when `process.env.NODE_ENV === "production"` and `"serviceWorker" in navigator`
    - Errors caught and logged to `console.error`; component returns `null`
    - _Requirements: 5.6_

  - [x] 6.2 Add `<ServiceWorkerRegistration />` to `RootLayout` in `src/app/layout.tsx`
    - Import and render the component inside `<body>` alongside `<Providers>`
    - No structural changes to the existing layout
    - _Requirements: 5.2, 5.6_

  - [x] 6.3 Create `fluxapay_frontend/src/lib/sw-strategy.ts` exporting the `selectStrategy` pure function
    - Export `STATIC_EXTENSIONS` regex and `CachingStrategy` type
    - Export `selectStrategy(url: URL): CachingStrategy` — returns `"network-first"` for `/api/*`, `"cache-first"` for static asset extensions, `"passthrough"` otherwise
    - _Requirements: 5.7_

  - [ ]* 6.4 Write property test for service worker environment guard (Property 2)
    - Add to `fluxapay_frontend/src/__tests__/pwa/pwa.property.test.ts`
    - Use `fast-check` to assert that a `simulateSwRegistration(env)` helper returns `true` if and only if `env === "production"` (minimum 100 runs)
    - **Property 2: Service worker environment guard**
    - **Validates: Requirements 5.6**

  - [ ]* 6.5 Write property test for service worker routing strategy selection (Property 3)
    - Add to `fluxapay_frontend/src/__tests__/pwa/pwa.property.test.ts`
    - Use `fast-check` with `fc.oneof` covering `/api/*` paths, static-extension paths, and arbitrary paths; assert `selectStrategy` returns the correct strategy for each case (minimum 200 runs)
    - **Property 3: Service worker routing strategy selection**
    - **Validates: Requirements 5.7**

- [x] 7. Create the service worker file
  - Create `fluxapay_frontend/public/sw.js` implementing the two caching strategies from the design
  - `fetch` event handler: routes `/api/*` to `networkFirst`, static-extension paths to `cacheFirst`, all others fall through
  - `cacheFirst(request)`: checks cache first, fetches and caches on miss
  - `networkFirst(request)`: fetches first, caches on success, falls back to cache on network failure
  - Cache name: `"fluxapay-v1"`
  - _Requirements: 5.2, 5.7_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Run `npm test` in `fluxapay_frontend/` and confirm all tests pass, including the three property-based tests. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The icon generation script (Task 1) must be run before the icon-files test (Task 2.3) will pass
- `sharp` is a `devDependency` — it is only needed at build/generation time, not at runtime
- The service worker (Tasks 6–7) implements Requirement 5 (Lighthouse compliance), which is marked optional in the requirements
- Property tests use `fast-check`, which is already installed as a dev dependency
- Each task references specific requirements for traceability
