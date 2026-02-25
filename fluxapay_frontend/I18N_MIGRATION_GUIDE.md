# i18n Migration Guide

This guide helps you migrate existing FluxaPay components to use internationalization.

## 🔄 Migration Steps

### Step 1: Install Dependencies

```bash
npm install next-intl
```

### Step 2: Move Existing Pages

The app structure needs to change to support locale routing:

**Before:**
```
src/app/
├── layout.tsx
├── page.tsx
├── dashboard/
│   └── page.tsx
└── login/
    └── page.tsx
```

**After:**
```
src/app/
├── [locale]/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   └── login/
│       └── page.tsx
├── layout.tsx (optional root layout)
└── providers.tsx
```

### Step 3: Update Imports

Replace Next.js navigation imports with i18n-aware versions:

**Before:**
```tsx
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
```

**After:**
```tsx
import { Link, useRouter, usePathname } from '@/i18n/routing';
```

### Step 4: Add Translations Hook

**Before:**
```tsx
export function MyComponent() {
  return (
    <div>
      <h1>Welcome to FluxaPay</h1>
      <button>Get Started</button>
    </div>
  );
}
```

**After:**
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

## 📋 Component Migration Examples

### Example 1: Hero Section

**Before:**
```tsx
export function Hero() {
  return (
    <section>
      <h1>Global Payment Infrastructure</h1>
      <p>Accept crypto and fiat payments seamlessly</p>
      <button>Get Started</button>
      <button>Learn More</button>
    </section>
  );
}
```

**After:**
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export function Hero() {
  const t = useTranslations('hero');
  const tCommon = useTranslations('common');
  
  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      <Link href="/signup">
        <button>{tCommon('getStarted')}</button>
      </Link>
      <button>{tCommon('learnMore')}</button>
    </section>
  );
}
```

**Translation file (messages/en.json):**
```json
{
  "hero": {
    "title": "Global Payment Infrastructure",
    "subtitle": "Accept crypto and fiat payments seamlessly"
  },
  "common": {
    "getStarted": "Get Started",
    "learnMore": "Learn More"
  }
}
```

### Example 2: Dashboard Stats

**Before:**
```tsx
export function DashboardStats({ stats }) {
  return (
    <div>
      <div>
        <span>Total Revenue</span>
        <span>${stats.revenue}</span>
      </div>
      <div>
        <span>Successful Payments</span>
        <span>{stats.payments}</span>
      </div>
    </div>
  );
}
```

**After:**
```tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import { formatCurrency } from '@/lib/i18n-utils';

export function DashboardStats({ stats }) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  
  return (
    <div>
      <div>
        <span>{t('totalRevenue')}</span>
        <span>{formatCurrency(stats.revenue, 'USD', locale)}</span>
      </div>
      <div>
        <span>{t('successfulPayments')}</span>
        <span>{stats.payments.toLocaleString(locale)}</span>
      </div>
    </div>
  );
}
```

### Example 3: Payment Status

**Before:**
```tsx
export function PaymentStatus({ status }) {
  const statusText = {
    pending: 'Pending',
    completed: 'Completed',
    failed: 'Failed',
  };
  
  return <span>{statusText[status]}</span>;
}
```

**After:**
```tsx
'use client';

import { useTranslations } from 'next-intl';

export function PaymentStatus({ status }) {
  const t = useTranslations('status');
  
  return <span>{t(status)}</span>;
}
```

**Translation file:**
```json
{
  "status": {
    "pending": "Pending",
    "completed": "Completed",
    "failed": "Failed"
  }
}
```

### Example 4: Form with Validation

**Before:**
```tsx
export function LoginForm() {
  const [error, setError] = useState('');
  
  const handleSubmit = async (data) => {
    try {
      await login(data);
    } catch (err) {
      setError('Invalid email or password');
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="Email" />
      <input placeholder="Password" type="password" />
      {error && <p>{error}</p>}
      <button>Sign In</button>
    </form>
  );
}
```

**After:**
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function LoginForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const [error, setError] = useState('');
  
  const handleSubmit = async (data) => {
    try {
      await login(data);
    } catch (err) {
      setError(tErrors('unauthorized'));
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input placeholder={t('email')} />
      <input placeholder={t('password')} type="password" />
      {error && <p>{error}</p>}
      <button>{t('signIn')}</button>
    </form>
  );
}
```

### Example 5: Date Display

**Before:**
```tsx
export function TransactionDate({ date }) {
  return (
    <span>
      {new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}
    </span>
  );
}
```

**After:**
```tsx
'use client';

import { useLocale } from 'next-intl';
import { formatDate } from '@/lib/i18n-utils';

export function TransactionDate({ date }) {
  const locale = useLocale();
  
  return <span>{formatDate(date, locale)}</span>;
}
```

## 🎯 Priority Migration Order

Migrate components in this order for maximum impact:

1. **Navigation & Header** - Most visible, affects all pages
2. **Landing Page** - First impression for users
3. **Authentication Pages** - Login, signup, password reset
4. **Dashboard** - Main user interface
5. **Payment Pages** - Critical user flow
6. **Settings & Profile** - User preferences
7. **Admin Pages** - Internal tools

## ✅ Migration Checklist

For each component:

- [ ] Add `'use client'` directive if using hooks
- [ ] Import `useTranslations` from `next-intl`
- [ ] Replace hardcoded text with `t('key')`
- [ ] Add translation keys to all locale files
- [ ] Replace `next/link` with `@/i18n/routing`
- [ ] Replace `next/navigation` with `@/i18n/routing`
- [ ] Use formatting utilities for numbers/dates/currency
- [ ] Test in all supported locales
- [ ] Verify SSR works correctly
- [ ] Check for hydration errors

## 🔍 Finding Hardcoded Text

Use these commands to find hardcoded text:

```bash
# Find JSX with quoted strings
grep -r ">[A-Z][^<]*<" src/

# Find button text
grep -r "<button>[^<]*</button>" src/

# Find heading text
grep -r "<h[1-6]>[^<]*</h[1-6]>" src/
```

## 🚨 Common Pitfalls

### 1. Forgetting 'use client' Directive

**Error:**
```
Error: useTranslations can only be used in Client Components
```

**Solution:**
Add `'use client'` at the top of the file.

### 2. Using Wrong Navigation

**Problem:**
Links don't include locale prefix.

**Solution:**
```tsx
// ❌ Wrong
import Link from 'next/link';

// ✅ Correct
import { Link } from '@/i18n/routing';
```

### 3. Hardcoded Formatting

**Problem:**
```tsx
// ❌ Wrong - doesn't respect locale
<span>${amount.toFixed(2)}</span>
```

**Solution:**
```tsx
// ✅ Correct
import { useLocale } from 'next-intl';
import { formatCurrency } from '@/lib/i18n-utils';

const locale = useLocale();
<span>{formatCurrency(amount, 'USD', locale)}</span>
```

### 4. Missing Translation Keys

**Error:**
```
Error: MISSING_MESSAGE: Could not resolve 'hero.title'
```

**Solution:**
Ensure the key exists in all locale files.

### 5. Server/Client Mismatch

**Error:**
```
Hydration failed because the initial UI does not match
```

**Solution:**
Ensure both server and client use the same locale detection.

## 📝 Translation Key Naming Conventions

Follow these conventions for consistency:

```json
{
  "common": {
    // Actions
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    
    // Navigation
    "home": "Home",
    "dashboard": "Dashboard"
  },
  
  "pages": {
    "home": {
      "title": "Home Page Title",
      "description": "Description"
    }
  },
  
  "components": {
    "header": {
      "logo": "FluxaPay"
    }
  },
  
  "forms": {
    "login": {
      "email": "Email",
      "password": "Password",
      "submit": "Sign In"
    }
  },
  
  "errors": {
    "generic": "Something went wrong",
    "network": "Network error"
  },
  
  "status": {
    "pending": "Pending",
    "completed": "Completed"
  }
}
```

## 🧪 Testing Migrated Components

### Manual Testing

1. Visit each locale URL:
   - `http://localhost:3075` (English)
   - `http://localhost:3075/fr` (French)
   - `http://localhost:3075/pt` (Portuguese)

2. Check:
   - All text is translated
   - Numbers are formatted correctly
   - Dates are formatted correctly
   - Currency displays properly
   - Navigation works
   - No hydration errors

### Automated Testing

```tsx
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

function renderWithIntl(component, locale = 'en', messages = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

test('renders translated text', () => {
  const messages = {
    common: { getStarted: 'Get Started' }
  };
  
  const { getByText } = renderWithIntl(<MyComponent />, 'en', messages);
  expect(getByText('Get Started')).toBeInTheDocument();
});
```

## 📊 Progress Tracking

Create a spreadsheet to track migration progress:

| Component | Status | Translator | Reviewer | Notes |
|-----------|--------|------------|----------|-------|
| Header | ✅ Done | John | Jane | - |
| Hero | ✅ Done | John | Jane | - |
| Dashboard | 🔄 In Progress | Sarah | - | - |
| Login | ⏳ Pending | - | - | - |

## 🎓 Training Team Members

Share these resources with your team:

1. This migration guide
2. `I18N_SETUP.md` for reference
3. Example components in `src/components/examples/`
4. [next-intl documentation](https://next-intl-docs.vercel.app/)

## 🚀 Deployment Considerations

Before deploying:

1. ✅ All components migrated
2. ✅ All translation files complete
3. ✅ Tested in all locales
4. ✅ No console errors
5. ✅ SEO metadata translated
6. ✅ Error messages translated
7. ✅ Email templates translated (if applicable)
8. ✅ Documentation updated

## 📞 Getting Help

If you encounter issues:

1. Check the [next-intl documentation](https://next-intl-docs.vercel.app/)
2. Review example components
3. Check common pitfalls section
4. Search GitHub issues
5. Ask in team chat

Good luck with your migration! 🎉
