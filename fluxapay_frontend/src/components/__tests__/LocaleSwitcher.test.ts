import { describe, it, expect } from 'vitest';
import { buildLocalizedPath } from '../LocaleSwitcher';

describe('buildLocalizedPath', () => {
  it('accepts and appends the search string and hash fragment', () => {
    const pathname = '/dashboard/payments';
    const nextLocale = 'fr';
    const search = '?page=2&status=confirmed';
    const hash = '#section-2';

    const result = buildLocalizedPath(pathname, nextLocale, search, hash);
    expect(result).toBe('/fr/dashboard/payments?page=2&status=confirmed#section-2');
  });

  it('preserves filter query params when switching to default locale', () => {
    const pathname = '/fr/dashboard/payments';
    const nextLocale = 'en';
    const search = '?page=2&status=confirmed';

    const result = buildLocalizedPath(pathname, nextLocale, search);
    expect(result).toBe('/dashboard/payments?page=2&status=confirmed');
  });

  it('formats search string properly if leading question mark is omitted', () => {
    const pathname = '/payments';
    const nextLocale = 'pt';
    const search = 'page=1&limit=20';

    const result = buildLocalizedPath(pathname, nextLocale, search);
    expect(result).toBe('/pt/payments?page=1&limit=20');
  });
});
