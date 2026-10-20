'use client';

import { useLocale } from 'next-intl';
import { getTextDirection } from './rtl';

/** Returns the text direction for the active checkout locale ('rtl' for Arabic). */
export function useCheckoutDirection(): 'rtl' | 'ltr' {
  let locale = 'en';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    locale = useLocale();
  } catch {
    /* rendered outside an intl provider (e.g. isolated tests) */
  }
  return getTextDirection(locale);
}
