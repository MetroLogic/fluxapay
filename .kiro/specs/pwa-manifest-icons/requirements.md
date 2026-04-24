# Requirements Document

## Introduction

This feature adds Progressive Web App (PWA) support to the FluxaPay merchant dashboard frontend. The goal is to make the dashboard installable on desktop and mobile devices, giving merchants a native-app-like experience with a standalone window, branded icons, and correct theme colors. The implementation covers the web app manifest, icon assets in required sizes, Next.js metadata integration, and optional Lighthouse PWA checklist compliance.

The feature is optional/nice-to-have and must not break existing functionality. It targets the Next.js 16.1.4 app router frontend located in `fluxapay_frontend/`.

---

## Glossary

- **Dashboard**: The FluxaPay merchant-facing Next.js web application.
- **Manifest**: The `manifest.json` (or `site.webmanifest`) file that describes the PWA to the browser.
- **Icon_Set**: The collection of PNG icon files at required sizes (192×192, 512×512, and optionally 180×180 for Apple touch icon).
- **Theme_Color**: The brand color `#FED449` (FluxaPay yellow) used as the browser UI accent when the app is installed.
- **Background_Color**: The color `#2E3539` (FluxaPay black) used as the splash screen background.
- **Standalone_Mode**: A PWA display mode where the app opens in its own window without browser navigation UI.
- **Next_Metadata**: The Next.js App Router `Metadata` API used in `layout.tsx` to inject `<link>` and `<meta>` tags.
- **Lighthouse**: Google's automated tool for auditing web app quality, including PWA compliance.
- **SEO_Lib**: The existing `src/lib/seo.ts` module that centralises metadata configuration.

---

## Requirements

### Requirement 1: Web App Manifest File

**User Story:** As a merchant, I want the FluxaPay dashboard to be installable on my device, so that I can access it quickly from my home screen or taskbar without opening a browser tab.

#### Acceptance Criteria

1. THE Dashboard SHALL serve a `manifest.json` file from the `/public` directory that is accessible at the `/manifest.json` URL path.
2. THE Manifest SHALL include a `name` field set to `"FluxaPay"`.
3. THE Manifest SHALL include a `short_name` field set to `"FluxaPay"`.
4. THE Manifest SHALL include a `description` field describing the merchant dashboard.
5. THE Manifest SHALL include a `start_url` field set to `"/"`.
6. THE Manifest SHALL include a `display` field set to `"standalone"`.
7. THE Manifest SHALL include a `theme_color` field set to `"#FED449"`.
8. THE Manifest SHALL include a `background_color` field set to `"#2E3539"`.
9. THE Manifest SHALL include an `orientation` field set to `"portrait-primary"`.
10. THE Manifest SHALL include an `icons` array containing at least one entry with `src`, `sizes`, and `type` fields.
11. IF the `manifest.json` file is missing or malformed, THEN THE Dashboard SHALL continue to function as a standard web application without errors.

---

### Requirement 2: PWA Icon Assets

**User Story:** As a merchant, I want the installed dashboard to display the FluxaPay brand icon on my home screen and taskbar, so that I can visually identify the app.

#### Acceptance Criteria

1. THE Icon_Set SHALL include a PNG icon at 192×192 pixels, referenced in the Manifest as `{ "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" }`.
2. THE Icon_Set SHALL include a PNG icon at 512×512 pixels, referenced in the Manifest as `{ "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }`.
3. THE Icon_Set SHALL include a PNG icon at 180×180 pixels for Apple touch icon support, placed at `/public/apple-touch-icon.png`.
4. THE Icon_Set SHALL include a 32×32 pixel favicon at `/public/favicon-32x32.png` and a 16×16 pixel favicon at `/public/favicon-16x16.png`.
5. THE Icon_Set SHALL use the FluxaPay brand mark derived from the existing `public/assets/logo.svg` as the source artwork.
6. WHEN an icon file is requested by the browser, THE Dashboard SHALL serve it with the correct `Content-Type` header (`image/png`).

---

### Requirement 3: Next.js Metadata Integration

**User Story:** As a developer, I want the PWA manifest and icons to be declared through the Next.js Metadata API, so that the correct `<link>` tags are injected into the HTML `<head>` automatically and consistently with the existing SEO setup.

#### Acceptance Criteria

1. THE Next_Metadata in `src/app/layout.tsx` SHALL include a `manifest` field pointing to `"/manifest.json"`.
2. THE Next_Metadata SHALL include an `icons` field that declares the Apple touch icon at `/apple-touch-icon.png` and the standard favicons at `/favicon-32x32.png` and `/favicon-16x16.png`.
3. THE Next_Metadata SHALL include a `themeColor` field set to `"#FED449"` for light mode and `"#2E3539"` for dark mode, using the Next.js `themeColor` array format.
4. WHEN the Dashboard HTML is rendered, THE Next_Metadata SHALL produce a `<link rel="manifest" href="/manifest.json">` tag in the `<head>`.
5. WHEN the Dashboard HTML is rendered, THE Next_Metadata SHALL produce a `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` tag in the `<head>`.
6. THE SEO_Lib `baseMetadata` object SHALL be updated to include the manifest and icon declarations so that all pages inherit them.

---

### Requirement 4: Theme Color and Display Mode

**User Story:** As a merchant, I want the installed dashboard to use FluxaPay brand colors in the browser chrome and open in a standalone window, so that the experience feels like a native app.

#### Acceptance Criteria

1. WHEN the Dashboard is launched in Standalone_Mode, THE Dashboard SHALL display without browser navigation UI (address bar, back/forward buttons).
2. THE Manifest `display` field SHALL be set to `"standalone"` to enable Standalone_Mode.
3. THE Manifest `theme_color` SHALL be `"#FED449"` so that supporting browsers render the browser toolbar in the FluxaPay yellow brand color.
4. THE Manifest `background_color` SHALL be `"#2E3539"` so that the splash screen background matches the FluxaPay dark brand color.
5. WHILE the Dashboard is running in Standalone_Mode, THE Dashboard SHALL render all existing routes and functionality without degradation.

---

### Requirement 5: Lighthouse PWA Checklist Compliance (Optional)

**User Story:** As a developer, I want the dashboard to pass the Lighthouse PWA installability checklist, so that browsers can offer the install prompt to merchants automatically.

#### Acceptance Criteria

1. WHERE Lighthouse PWA auditing is performed, THE Dashboard SHALL pass the "Web app manifest meets the installability requirements" audit.
2. WHERE Lighthouse PWA auditing is performed, THE Dashboard SHALL pass the "Registers a service worker that controls page and start_url" audit.
3. WHERE Lighthouse PWA auditing is performed, THE Dashboard SHALL pass the "Manifest has a maskable icon" audit.
4. WHERE Lighthouse PWA auditing is performed, THE Dashboard SHALL pass the "Has a `<meta name="theme-color">` tag" audit.
5. WHERE Lighthouse PWA auditing is performed, THE Dashboard SHALL pass the "Provides a valid `apple-touch-icon`" audit.
6. IF a service worker is registered, THEN THE Dashboard SHALL register it only in production builds to avoid interfering with Next.js hot-module replacement in development.
7. IF a service worker is registered, THEN THE Dashboard SHALL use a cache-first strategy for static assets and a network-first strategy for API routes.
