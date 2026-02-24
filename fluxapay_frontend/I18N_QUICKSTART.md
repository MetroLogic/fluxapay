# i18n Quick Start Guide

Get up and running with internationalization in 5 minutes!

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
cd fluxapay_frontend
npm install
```

This will install `next-intl` which is already added to `package.json`.

### 2. Verify File Structure

Ensure these files exist (they should already be created):

```
✅ src/i18n/routing.ts
✅ src/i18n/request.ts
✅ src/middleware.ts
✅ messages/en.json
✅ messages/fr.json
✅ messages/pt.json
✅ src/components/LocaleSwitcher.tsx
✅ src/lib/i18n-utils.ts
```

### 3. Test the Setup

Start the development server:

```bash
npm run dev
```

Visit these URLs to test different locales:

- English: http://localhost:3075
- French: http://localhost:3075/fr
- Portuguese: http://localhost:3075/pt

## 📝 Basic Usage

### In a Client Component

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

### In a Server Component

```tsx
import { useTranslations } from 'next-intl';

export default function MyPage() {
  const t = useTranslations('dashboard');
  
  return <h1>{t('overview')}</h1>;
}
```

### Navigation

```tsx
import { Link } from '@/i18n/routing';

export function Nav() {
  return (
    <nav>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/settings">Settings</Link>
    </nav>
  );
}
```

### Add Language Switcher

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

## 💰 Format Currency

```tsx
'use client';

import { useLocale } from 'next-intl';
import { formatCurrency } from '@/lib/i18n-utils';

export function Price({ amount }: { amount: number }) {
  const locale = useLocale();
  return <span>{formatCurrency(amount, 'USD', locale)}</span>;
}
```

## 📅 Format Dates

```tsx
'use client';

import { useLocale } from 'next-intl';
import { formatDate } from '@/lib/i18n-utils';

export function DateDisplay({ date }: { date: Date }) {
  const locale = useLocale();
  return <span>{formatDate(date, locale)}</span>;
}
```

## ➕ Add New Translation

1. Open `messages/en.json`
2. Add your key:
```json
{
  "mySection": {
    "myKey": "My English Text"
  }
}
```
3. Add to other locales (`fr.json`, `pt.json`)
4. Use in component:
```tsx
const t = useTranslations('mySection');
<p>{t('myKey')}</p>
```

## 🌍 Add New Language

1. Create `messages/es.json` (copy from `en.json`)
2. Translate all values
3. Update `src/i18n/routing.ts`:
```typescript
locales: ['en', 'fr', 'pt', 'es']
```
4. Update `src/middleware.ts`:
```typescript
matcher: ['/', '/(fr|pt|es)/:path*', ...]
```
5. Update `src/components/LocaleSwitcher.tsx`:
```typescript
const localeNames = {
  // ...
  es: 'Español'
};
```

## 🎯 Next Steps

1. Read `I18N_SETUP.md` for detailed documentation
2. Read `I18N_MIGRATION_GUIDE.md` to migrate existing components
3. Check `src/components/examples/TranslationExamples.tsx` for more examples
4. Start migrating your components!

## 🐛 Troubleshooting

### Translations not showing?
- Check the translation key exists in `messages/[locale].json`
- Verify you're using `useTranslations()` correctly
- Check browser console for errors

### Navigation not working?
- Use `Link` from `@/i18n/routing`, not `next/link`
- Use `useRouter` from `@/i18n/routing`, not `next/navigation`

### Locale not changing?
- Clear browser cache
- Check middleware is running (should see locale in URL)
- Verify `src/middleware.ts` matcher pattern

## 📚 Resources

- Full Setup Guide: `I18N_SETUP.md`
- Migration Guide: `I18N_MIGRATION_GUIDE.md`
- Example Components: `src/components/examples/`
- [next-intl Docs](https://next-intl-docs.vercel.app/)

Happy translating! 🎉
