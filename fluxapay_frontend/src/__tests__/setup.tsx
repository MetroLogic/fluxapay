import '@testing-library/jest-dom';
import { vi } from 'vitest';
import en from '../../messages/en.json';

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
  Link: ({ children, href }) => children,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  redirect: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns) => (key, params) => {
    let result = ns ? en[ns] : en;
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
  default: (props) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));
