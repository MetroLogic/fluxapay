const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export function getTextDirection(locale: string | undefined | null): 'rtl' | 'ltr' {
  const base = (locale ?? '').toLowerCase().split('-')[0];
  return RTL_LOCALES.has(base) ? 'rtl' : 'ltr';
}
