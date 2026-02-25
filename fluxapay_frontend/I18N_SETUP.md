# Internationalization (i18n) Setup Guide

This document explains the complete i18n implementation for FluxaPay using `next-intl`.

## 📋 Overview

The project supports multiple locales with automatic routing, SSR support, and locale-aware formatting for:
- **Supported Locales**: English (en), French (fr), Portuguese (pt)
- **Default Locale**: English (en)
- **Routing Strategy**: `as-needed` (default locale has no prefix)

## 🏗️ Architecture

### Directory Structure

```
fluxapay_frontend/
├── messages/                    # Translation files
│   ├── en.json                 # English translations
│   ├── fr.json                 # French translations
│   └── pt.json                 # Portuguese translations
├── src/
│   ├── i18n/
│   │   ├── request.ts          # Server-side i18n configuration
│   │   └── routing.ts          # Routing configuration & navigation
│   ├── middleware.ts           # Locale detection & routing middleware
│   ├── app/
│   │   └── [locale]/           # Locale-based routing
│   │       ├── layout.tsx      # Root layout with NextIntlClientProvider
│   │       └── page.tsx        # Home page
│   ├── components/
│   │   ├── LocaleSwitcher.tsx  # Language switcher component
│   │   └── examples/           # Example components
│   └── lib/
│       └── i18n-utils.ts       # Formatting utilities
└── next.config.ts              # Next.js config with next-intl plugin
```

## 🚀 Installation

Install the required dependency:

```bash
npm install next-intl
```

## 📝 Configuration Files

### 1. `src/i18n/routing.ts`
Defines supported locales and creates navigation helpers:

```typescript
import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['en', 'fr', 'pt'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
});

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
```

### 2. `src/i18n/request.ts`
Server-side configuration for loading messages:

```typescript
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

### 3. `src/middleware.ts`
Handles locale detection and routing:

```typescript
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: ['/', '/(fr|pt)/:path*', '/((?!_next|_vercel|.*\\..*).*)'],
};
```

### 4. `next.config.ts`
Integrates next-intl plugin:

```typescript
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // your config
};

export default withNextIntl(nextConfig);
```

## 🌍 URL Structure

With `localePrefix: 'as-needed'`:

- English (default): `/`, `/dashboard`, `/login`
- French: `/fr`, `/fr/dashboard`, `/fr/login`
- Portuguese: `/pt`, `/pt/dashboard`, `/pt/login`

## 💬 Using Translations

### Basic Usage

```tsx
'use client';

import { useTranslations } from 'next-intl';

export function MyComponent() {
  const t = useTranslations();
  
  return (
    <div>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.description')}</p>
      <button>{t('common.getStarted')}</button>
    </div>
  );
}
```

### Scoped Translations

```tsx
import { useTranslations } from 'next-intl';

export function PaymentForm() {
  const t = useTranslations('payment');
  
  return (
    <div>
      <h2>{t('title')}</h2>
      <label>{t('amount')}</label>
      <button>{t('processing')}</button>
    </div>
  );
}
```

### Server Components

```tsx
import { useTranslations } from 'next-intl';

export default function ServerPage() {
  const t = useTranslations('dashboard');
  
  return <h1>{t('overview')}</h1>;
}
```

## 🔗 Navigation

Use the i18n-aware navigation helpers:

```tsx
import { Link, useRouter, usePathname } from '@/i18n/routing';

export function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  
  return (
    <nav>
      {/* Automatically includes locale prefix */}
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/settings">Settings</Link>
      
      <button onClick={() => router.push('/payments')}>
        View Payments
      </button>
    </nav>
  );
}
```

## 🎨 Locale Switcher

The `LocaleSwitcher` component allows users to change languages:

```tsx
import LocaleSwitcher from '@/components/LocaleSwitcher';

export function Header() {
  return (
    <header>
      <nav>
        {/* Your navigation */}
      </nav>
      <LocaleSwitcher />
    </header>
  );
}
```

## 💰 Formatting Utilities

### Currency Formatting

```tsx
import { useLocale } from 'next-intl';
import { formatCurrency } from '@/lib/i18n-utils';

export function PriceDisplay({ amount }: { amount: number }) {
  const locale = useLocale();
  
  return (
    <div>
      <p>{formatCurrency(amount, 'USD', locale)}</p>
      {/* en: $1,234.56 */}
      {/* fr: 1 234,56 $US */}
      {/* pt: US$ 1.234,56 */}
    </div>
  );
}
```

### Date Formatting

```tsx
import { useLocale } from 'next-intl';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/i18n-utils';

export function DateDisplay({ date }: { date: Date }) {
  const locale = useLocale();
  
  return (
    <div>
      <p>{formatDate(date, locale)}</p>
      {/* en: January 15, 2024 */}
      {/* fr: 15 janvier 2024 */}
      {/* pt: 15 de janeiro de 2024 */}
      
      <p>{formatDateTime(date, locale)}</p>
      {/* en: Jan 15, 2024, 10:30 AM */}
      
      <p>{formatRelativeTime(date, locale)}</p>
      {/* en: 2 hours ago */}
      {/* fr: il y a 2 heures */}
      {/* pt: há 2 horas */}
    </div>
  );
}
```

### Number Formatting

```tsx
import { useLocale } from 'next-intl';
import { formatNumber } from '@/lib/i18n-utils';

export function StatsDisplay({ value }: { value: number }) {
  const locale = useLocale();
  
  return (
    <div>
      <p>{formatNumber(value, locale)}</p>
      {/* en: 1,234,567 */}
      {/* fr: 1 234 567 */}
      {/* pt: 1.234.567 */}
    </div>
  );
}
```

## 📦 Translation File Structure

Translation files use nested JSON structure:

```json
{
  "common": {
    "getStarted": "Get Started",
    "signIn": "Sign In"
  },
  "hero": {
    "title": "Global Payment Infrastructure",
    "subtitle": "Accept crypto and fiat payments seamlessly"
  },
  "dashboard": {
    "overview": "Overview",
    "payments": "Payments"
  }
}
```

Access nested translations:
```tsx
t('common.getStarted')      // "Get Started"
t('hero.title')             // "Global Payment Infrastructure"
t('dashboard.overview')     // "Overview"
```

## ➕ Adding New Languages

1. **Create translation file**: `messages/es.json` (for Spanish)

2. **Update routing config** in `src/i18n/routing.ts`:
```typescript
export const routing = defineRouting({
  locales: ['en', 'fr', 'pt', 'es'],  // Add 'es'
  defaultLocale: 'en',
  localePrefix: 'as-needed',
});
```

3. **Update middleware matcher** in `src/middleware.ts`:
```typescript
export const config = {
  matcher: ['/', '/(fr|pt|es)/:path*', '/((?!_next|_vercel|.*\\..*).*)'],
};
```

4. **Update LocaleSwitcher** in `src/components/LocaleSwitcher.tsx`:
```typescript
const localeNames: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  pt: 'Português',
  es: 'Español',  // Add Spanish
};

const localeFlags: Record<string, string> = {
  en: '🇬🇧',
  fr: '🇫🇷',
  pt: '🇧🇷',
  es: '🇪🇸',  // Add Spanish flag
};
```

## 🔍 SEO Considerations

### Metadata per Locale

```tsx
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: 'metadata' });
  
  return {
    title: t('title'),
    description: t('description'),
  };
}
```

### Alternate Language Links

Add to your layout:

```tsx
export default function LocaleLayout({ params }: { params: { locale: string } }) {
  return (
    <html lang={params.locale}>
      <head>
        <link rel="alternate" hrefLang="en" href="https://fluxapay.com" />
        <link rel="alternate" hrefLang="fr" href="https://fluxapay.com/fr" />
        <link rel="alternate" hrefLang="pt" href="https://fluxapay.com/pt" />
      </head>
      {/* ... */}
    </html>
  );
}
```

## 🧪 Testing

### Test Different Locales

```tsx
// Visit different URLs
http://localhost:3075          // English (default)
http://localhost:3075/fr       // French
http://localhost:3075/pt       // Portuguese
```

### Test Formatting

```tsx
import { formatCurrency, formatDate } from '@/lib/i18n-utils';

// Test currency formatting
console.log(formatCurrency(1234.56, 'USD', 'en')); // $1,234.56
console.log(formatCurrency(1234.56, 'USD', 'fr')); // 1 234,56 $US
console.log(formatCurrency(1234.56, 'USD', 'pt')); // US$ 1.234,56

// Test date formatting
const date = new Date('2024-01-15');
console.log(formatDate(date, 'en')); // January 15, 2024
console.log(formatDate(date, 'fr')); // 15 janvier 2024
console.log(formatDate(date, 'pt')); // 15 de janeiro de 2024
```

## 📚 Best Practices

1. **Always use translation keys**: Never hardcode user-facing text
2. **Use scoped translations**: `useTranslations('payment')` for better organization
3. **Use i18n navigation**: Import from `@/i18n/routing`, not `next/navigation`
4. **Format numbers/dates**: Use utility functions for locale-aware formatting
5. **Keep translations consistent**: Use the same structure across all locale files
6. **Test all locales**: Verify translations and formatting for each language
7. **Use TypeScript**: Leverage type safety for translation keys (optional)

## 🐛 Common Issues

### Issue: Translations not loading
**Solution**: Ensure the locale parameter is correctly passed and messages are imported

### Issue: Navigation doesn't include locale
**Solution**: Use `Link` from `@/i18n/routing`, not `next/link`

### Issue: Hydration errors
**Solution**: Ensure server and client render the same locale

### Issue: Middleware not working
**Solution**: Check the matcher pattern in `middleware.ts`

## 📖 Resources

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [Next.js Internationalization](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [Intl API (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)

## 🎯 Next Steps

1. Extract all hardcoded text from existing components
2. Add translations to `messages/*.json` files
3. Update components to use `useTranslations()`
4. Add `LocaleSwitcher` to navigation
5. Test all pages in different locales
6. Add more languages as needed
7. Consider adding TypeScript types for translation keys
