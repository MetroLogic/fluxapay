import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Locale entrypoints + unprefixed auth URLs. With `localePrefix: 'as-needed'`, `/en/signup`
  // redirects to `/signup`; those paths must still run next-intl middleware or they 404 (no `[locale]` segment).
  // Dashboard and other non-localized routes stay outside this list.
  matcher: [
    '/',
    '/(en|fr|pt)/:path*',
    '/signup',
    '/login',
    '/verify-otp',
  ],
};
