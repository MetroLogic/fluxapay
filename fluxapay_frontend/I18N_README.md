# FluxaPay Internationalization (i18n) Implementation

Complete internationalization setup for FluxaPay using `next-intl`, targeting emerging markets in Africa, Latin America, and beyond.

## 🌍 Overview

This implementation provides:
- ✅ Multi-language support (English, French, Portuguese)
- ✅ Automatic locale detection and routing
- ✅ Server-Side Rendering (SSR) compatible
- ✅ Locale-aware currency formatting
- ✅ Locale-aware date/time formatting
- ✅ Locale-aware number formatting
- ✅ Easy-to-use language switcher
- ✅ Type-safe translations (optional)
- ✅ Scalable architecture for adding more languages

## 📚 Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| **[I18N_QUICKSTART.md](./I18N_QUICKSTART.md)** | Get started in 5 minutes | Everyone |
| **[I18N_SETUP.md](./I18N_SETUP.md)** | Complete technical documentation | Developers |
| **[I18N_MIGRATION_GUIDE.md](./I18N_MIGRATION_GUIDE.md)** | Step-by-step migration guide | Developers |
| **[EXAMPLE_MIGRATION.md](./EXAMPLE_MIGRATION.md)** | Real-world before/after example | Developers |

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

### 3. Test Different Locales

- English: http://localhost:3075
- French: http://localhost:3075/fr
- Portuguese: http://localhost:3075/pt

### 4. Add Language Switcher

```tsx
import LocaleSwitcher from '@/components/LocaleSwitcher';

export function Header() {
  return (
    <header>
      <nav>{/* Your navigation */}</nav>
      <LocaleSwitcher />
    </header>
  );
}
```

## 📁 Project Structure

```
fluxapay_frontend/
├── messages/                           # Translation files
│   ├── en.json                        # English translations
│   ├── fr.json                        # French translations
│   └── pt.json                        # Portuguese translations
│
├── src/
│   ├── i18n/                          # i18n configuration
│   │   ├── request.ts                 # Server-side config
│   │   └── routing.ts                 # Routing & navigation
│   │
│   ├── middleware.ts                  # Locale detection
│   │
│   ├── app/
│   │   ├── [locale]/                  # Locale-based routing
│   │   │   ├── layout.tsx            # Root layout with provider
│   │   │   ├── page.tsx              # Home page
│   │   │   ├── dashboard/            # Dashboard pages
│   │   │   ├── login/                # Auth pages
│   │   │   └── ...                   # Other pages
│   │   └── providers.tsx             # App providers
│   │
│   ├── components/
│   │   ├── LocaleSwitcher.tsx        # Language switcher
│   │   └── examples/                 # Example components
│   │       └── TranslationExamples.tsx
│   │
│   ├── lib/
│   │   └── i18n-utils.ts             # Formatting utilities
│   │
│   └── types/
│       └── i18n.d.ts                 # TypeScript types
│
├── next.config.ts                     # Next.js config with plugin
└── package.json                       # Dependencies
```

## 🎯 Supported Locales

| Locale | Language | Flag | Target Markets |
|--------|----------|------|----------------|
| `en` | English | 🇬🇧 | Global (default) |
| `fr` | French | 🇫🇷 | West/Central Africa, Haiti |
| `pt` | Portuguese | 🇧🇷 | Brazil, Angola, Mozambique |

## 💡 Usage Examples

### Basic Translation

```tsx
'use client';

import { useTranslations } from 'next-intl';

export function MyComponent() {
  const t = useTranslations();
  
  return (
    <div>
      <h1>{t('hero.title')}</h1>
      <button>{t('common.getStarted')}</button>
    </div>
  );
}
```

### Currency Formatting

```tsx
'use client';

import { useLocale } from 'next-intl';
import { formatCurrency } from '@/lib/i18n-utils';

export function Price({ amount }: { amount: number }) {
  const locale = useLocale();
  return <span>{formatCurrency(amount, 'USD', locale)}</span>;
}

// Output:
// en: $1,234.56
// fr: 1 234,56 $US
// pt: US$ 1.234,56
```

### Date Formatting

```tsx
'use client';

import { useLocale } from 'next-intl';
import { formatDate } from '@/lib/i18n-utils';

export function DateDisplay({ date }: { date: Date }) {
  const locale = useLocale();
  return <span>{formatDate(date, locale)}</span>;
}

// Output:
// en: January 15, 2024
// fr: 15 janvier 2024
// pt: 15 de janeiro de 2024
```

### Navigation

```tsx
import { Link } from '@/i18n/routing';

export function Nav() {
  return (
    <nav>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/payments">Payments</Link>
    </nav>
  );
}

// Automatically generates:
// en: /dashboard, /payments
// fr: /fr/dashboard, /fr/payments
// pt: /pt/dashboard, /pt/payments
```

## 🔧 Configuration

### Supported Locales

Edit `src/i18n/routing.ts`:

```typescript
export const routing = defineRouting({
  locales: ['en', 'fr', 'pt'],  // Add more here
  defaultLocale: 'en',
  localePrefix: 'as-needed',
});
```

### Middleware Matcher

Edit `src/middleware.ts`:

```typescript
export const config = {
  matcher: ['/', '/(fr|pt)/:path*', '/((?!_next|_vercel|.*\\..*).*)'],
};
```

## ➕ Adding New Languages

### Example: Adding Spanish

1. **Create translation file**: `messages/es.json`

2. **Update routing** (`src/i18n/routing.ts`):
```typescript
locales: ['en', 'fr', 'pt', 'es']
```

3. **Update middleware** (`src/middleware.ts`):
```typescript
matcher: ['/', '/(fr|pt|es)/:path*', ...]
```

4. **Update LocaleSwitcher** (`src/components/LocaleSwitcher.tsx`):
```typescript
const localeNames = {
  // ...
  es: 'Español'
};
```

See [I18N_SETUP.md](./I18N_SETUP.md#-adding-new-languages) for details.

## 📦 Translation Files

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

Access with dot notation:
```tsx
t('common.getStarted')      // "Get Started"
t('hero.title')             // "Global Payment Infrastructure"
t('dashboard.overview')     // "Overview"
```

## 🛠️ Utilities

### Currency Formatting

```typescript
formatCurrency(amount: number, currency: string, locale: string): string
```

### Date Formatting

```typescript
formatDate(date: Date | string, locale: string, options?: Intl.DateTimeFormatOptions): string
formatDateTime(date: Date | string, locale: string, options?: Intl.DateTimeFormatOptions): string
formatRelativeTime(date: Date | string, locale: string): string
```

### Number Formatting

```typescript
formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string
```

See [I18N_SETUP.md](./I18N_SETUP.md#-formatting-utilities) for details.

## 🧪 Testing

### Manual Testing

Visit different locale URLs:
```bash
http://localhost:3075          # English
http://localhost:3075/fr       # French
http://localhost:3075/pt       # Portuguese
```

### Verify

- ✅ All text is translated
- ✅ Currency displays correctly
- ✅ Dates display correctly
- ✅ Numbers display correctly
- ✅ Navigation includes locale prefix
- ✅ Language switcher works
- ✅ No console errors
- ✅ No hydration errors

## 📖 Best Practices

1. **Always use translation keys** - Never hardcode user-facing text
2. **Use scoped translations** - `useTranslations('payment')` for organization
3. **Use i18n navigation** - Import from `@/i18n/routing`, not `next/navigation`
4. **Format numbers/dates** - Use utility functions for locale-aware formatting
5. **Keep translations consistent** - Same structure across all locale files
6. **Test all locales** - Verify translations and formatting
7. **Add 'use client'** - Required when using hooks

## 🐛 Troubleshooting

### Translations not showing?
- Check translation key exists in `messages/[locale].json`
- Verify `useTranslations()` is used correctly
- Check browser console for errors

### Navigation not working?
- Use `Link` from `@/i18n/routing`, not `next/link`
- Use `useRouter` from `@/i18n/routing`, not `next/navigation`

### Locale not changing?
- Clear browser cache
- Check middleware is running
- Verify middleware matcher pattern

See [I18N_SETUP.md](./I18N_SETUP.md#-common-issues) for more.

## 📚 Resources

### Internal Documentation
- [Quick Start Guide](./I18N_QUICKSTART.md)
- [Complete Setup Guide](./I18N_SETUP.md)
- [Migration Guide](./I18N_MIGRATION_GUIDE.md)
- [Example Migration](./EXAMPLE_MIGRATION.md)

### External Resources
- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [Next.js i18n](https://nextjs.org/docs/app/building-your-application/routing/internationalization)
- [Intl API (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)

## 🎯 Roadmap

### Phase 1: Foundation ✅
- [x] Setup next-intl
- [x] Configure routing
- [x] Create translation files (en, fr, pt)
- [x] Build LocaleSwitcher component
- [x] Create formatting utilities
- [x] Write documentation

### Phase 2: Migration (In Progress)
- [ ] Migrate landing page
- [ ] Migrate authentication pages
- [ ] Migrate dashboard
- [ ] Migrate payment pages
- [ ] Migrate settings pages
- [ ] Migrate admin pages

### Phase 3: Enhancement
- [ ] Add more languages (Spanish, Swahili, etc.)
- [ ] Add TypeScript type safety for translation keys
- [ ] Add translation management tool
- [ ] Add automated translation testing
- [ ] Add RTL support (if needed)

### Phase 4: Optimization
- [ ] Implement lazy loading for translations
- [ ] Add translation caching
- [ ] Optimize bundle size
- [ ] Add performance monitoring

## 🤝 Contributing

### Adding Translations

1. Fork the repository
2. Add/update translations in `messages/[locale].json`
3. Test in all locales
4. Submit pull request

### Reporting Issues

Found a translation error or missing key?
1. Check if key exists in `messages/en.json`
2. Verify the key is used correctly in components
3. Create an issue with details

## 📄 License

This i18n implementation is part of the FluxaPay project.

## 🎉 Credits

Built with:
- [next-intl](https://next-intl-docs.vercel.app/) - Internationalization for Next.js
- [Next.js](https://nextjs.org/) - React framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety

---

**Need Help?** Check the documentation or reach out to the team!

**Ready to Start?** Read [I18N_QUICKSTART.md](./I18N_QUICKSTART.md) to get started in 5 minutes!
