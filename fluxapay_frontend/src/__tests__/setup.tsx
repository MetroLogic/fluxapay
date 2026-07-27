import '@testing-library/jest-dom';
import { vi } from 'vitest';
import en from '../../messages/en.json';
import React from 'react';

// jsdom doesn't implement matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Global mocks
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: React.ReactNode; href: string }) => children,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  redirect: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, string | number>) => {
    let result: any = ns ? en[ns as keyof typeof en] : en;
    if (!result) return key;
    const keys = key.split('.');
    for (const k of keys) {
      result = result?.[k];
    }
    if (typeof result === 'string') {
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          result = (result as string).replace(`{${k}}`, String(v));
        });
      }
      return result;
    }
    return key;
  },
  useLocale: () => 'en',
  useTimeZone: () => 'UTC',
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" {...props} />;
  },
}));
