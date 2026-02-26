# Real-World Migration Example

This document shows a complete before/after example of migrating a FluxaPay component to use i18n.

## 📦 Example: Payment Dashboard Component

### BEFORE (No i18n)

```tsx
// src/components/PaymentDashboard.tsx
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  customer: string;
  date: Date;
}

export function PaymentDashboard({ payments }: { payments: Payment[] }) {
  const router = useRouter();

  const stats = {
    totalRevenue: 125430.50,
    successfulPayments: 1234,
    pendingSettlements: 45,
    activeCustomers: 892,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      default:
        return status;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex gap-4">
          <Link href="/dashboard/payments">
            <button className="px-4 py-2 bg-blue-600 text-white rounded">
              View All Payments
            </button>
          </Link>
          <button 
            onClick={() => router.push('/dashboard/settings')}
            className="px-4 py-2 border rounded"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">Total Revenue</p>
          <p className="text-2xl font-bold">
            ${stats.totalRevenue.toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">Successful Payments</p>
          <p className="text-2xl font-bold">{stats.successfulPayments}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">Pending Settlements</p>
          <p className="text-2xl font-bold">{stats.pendingSettlements}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">Active Customers</p>
          <p className="text-2xl font-bold">{stats.activeCustomers}</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {payment.customer}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    ${payment.amount.toFixed(2)} {payment.currency}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-sm ${getStatusColor(payment.status)}`}>
                      {getStatusText(payment.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {payment.date.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link href={`/dashboard/payments/${payment.id}`}>
                      <button className="text-blue-600 hover:text-blue-800">
                        View Details
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {payments.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 mb-4">No transactions yet</p>
          <Link href="/dashboard/developers">
            <button className="px-4 py-2 bg-blue-600 text-white rounded">
              Get Started with API
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
```

### AFTER (With i18n)

```tsx
// src/components/PaymentDashboard.tsx
'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { formatCurrency, formatDate } from '@/lib/i18n-utils';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  customer: string;
  date: Date;
}

export function PaymentDashboard({ payments }: { payments: Payment[] }) {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tStatus = useTranslations('status');
  const locale = useLocale();
  const router = useRouter();

  const stats = {
    totalRevenue: 125430.50,
    successfulPayments: 1234,
    pendingSettlements: 45,
    activeCustomers: 892,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('overview')}</h1>
        <div className="flex gap-4">
          <Link href="/dashboard/payments">
            <button className="px-4 py-2 bg-blue-600 text-white rounded">
              {t('viewAll')}
            </button>
          </Link>
          <button 
            onClick={() => router.push('/dashboard/settings')}
            className="px-4 py-2 border rounded"
          >
            {t('settings')}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">{t('totalRevenue')}</p>
          <p className="text-2xl font-bold">
            {formatCurrency(stats.totalRevenue, 'USD', locale)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">{t('successfulPayments')}</p>
          <p className="text-2xl font-bold">
            {stats.successfulPayments.toLocaleString(locale)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">{t('pendingSettlements')}</p>
          <p className="text-2xl font-bold">
            {stats.pendingSettlements.toLocaleString(locale)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-2">{t('activeCustomers')}</p>
          <p className="text-2xl font-bold">
            {stats.activeCustomers.toLocaleString(locale)}
          </p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">{t('recentTransactions')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('customer')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('amount')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('date')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {tCommon('actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {payment.customer}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {formatCurrency(payment.amount, payment.currency, locale)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-sm ${getStatusColor(payment.status)}`}>
                      {tStatus(payment.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {formatDate(payment.date, locale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link href={`/dashboard/payments/${payment.id}`}>
                      <button className="text-blue-600 hover:text-blue-800">
                        {tCommon('view')}
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {payments.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 mb-4">{t('noTransactions')}</p>
          <Link href="/dashboard/developers">
            <button className="px-4 py-2 bg-blue-600 text-white rounded">
              {t('getStartedAPI')}
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
```

### Required Translation Keys

Add these to `messages/en.json`:

```json
{
  "common": {
    "view": "View",
    "actions": "Actions"
  },
  "dashboard": {
    "overview": "Dashboard",
    "viewAll": "View All Payments",
    "settings": "Settings",
    "totalRevenue": "Total Revenue",
    "successfulPayments": "Successful Payments",
    "pendingSettlements": "Pending Settlements",
    "activeCustomers": "Active Customers",
    "recentTransactions": "Recent Transactions",
    "customer": "Customer",
    "amount": "Amount",
    "status": "Status",
    "date": "Date",
    "noTransactions": "No transactions yet",
    "getStartedAPI": "Get Started with API"
  },
  "status": {
    "pending": "Pending",
    "completed": "Completed",
    "failed": "Failed"
  }
}
```

## 🔍 Key Changes Explained

### 1. Added 'use client' Directive
```tsx
'use client';
```
Required because we're using hooks (`useTranslations`, `useLocale`, `useRouter`).

### 2. Imported i18n Hooks
```tsx
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { formatCurrency, formatDate } from '@/lib/i18n-utils';
```

### 3. Replaced Hardcoded Text
```tsx
// Before
<h1 className="text-3xl font-bold">Dashboard</h1>

// After
<h1 className="text-3xl font-bold">{t('overview')}</h1>
```

### 4. Used Scoped Translations
```tsx
const t = useTranslations('dashboard');
const tCommon = useTranslations('common');
const tStatus = useTranslations('status');
```
This organizes translations by namespace.

### 5. Replaced Currency Formatting
```tsx
// Before
${payment.amount.toFixed(2)} {payment.currency}

// After
{formatCurrency(payment.amount, payment.currency, locale)}
```
Now respects locale-specific formatting:
- English: $1,234.56 USD
- French: 1 234,56 $US
- Portuguese: US$ 1.234,56

### 6. Replaced Date Formatting
```tsx
// Before
{payment.date.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})}

// After
{formatDate(payment.date, locale, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})}
```
Now respects locale-specific date formats:
- English: Jan 15, 2024
- French: 15 janv. 2024
- Portuguese: 15 de jan. de 2024

### 7. Replaced Number Formatting
```tsx
// Before
{stats.successfulPayments}

// After
{stats.successfulPayments.toLocaleString(locale)}
```
Now uses locale-specific number separators:
- English: 1,234
- French: 1 234
- Portuguese: 1.234

### 8. Used i18n Navigation
```tsx
// Before
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// After
import { Link, useRouter } from '@/i18n/routing';
```
Automatically includes locale prefix in URLs.

## 📊 Results

### URL Behavior

**Before:**
- All URLs: `/dashboard`, `/dashboard/payments`

**After:**
- English: `/dashboard`, `/dashboard/payments`
- French: `/fr/dashboard`, `/fr/dashboard/payments`
- Portuguese: `/pt/dashboard`, `/pt/dashboard/payments`

### Display Examples

**Currency (amount: 1234.56, currency: 'USD'):**
- English: $1,234.56
- French: 1 234,56 $US
- Portuguese: US$ 1.234,56

**Date (2024-01-15):**
- English: Jan 15, 2024
- French: 15 janv. 2024
- Portuguese: 15 de jan. de 2024

**Number (1234):**
- English: 1,234
- French: 1 234
- Portuguese: 1.234

## ✅ Migration Checklist

- [x] Added `'use client'` directive
- [x] Imported i18n hooks
- [x] Replaced all hardcoded text with `t()` calls
- [x] Used scoped translations for organization
- [x] Replaced currency formatting with `formatCurrency()`
- [x] Replaced date formatting with `formatDate()`
- [x] Replaced number formatting with `toLocaleString(locale)`
- [x] Updated navigation imports
- [x] Added all translation keys to locale files
- [x] Tested in all supported locales
- [x] Verified formatting works correctly

## 🎯 Testing

Test the component in different locales:

```bash
# English
http://localhost:3075/dashboard

# French
http://localhost:3075/fr/dashboard

# Portuguese
http://localhost:3075/pt/dashboard
```

Verify:
- ✅ All text is translated
- ✅ Currency displays correctly
- ✅ Dates display correctly
- ✅ Numbers display correctly
- ✅ Navigation works
- ✅ No console errors
- ✅ No hydration errors

## 🚀 Next Steps

Apply this same pattern to other components:
1. Add `'use client'` if needed
2. Import i18n hooks
3. Replace hardcoded text
4. Use formatting utilities
5. Update navigation
6. Add translation keys
7. Test thoroughly

Good luck! 🎉
