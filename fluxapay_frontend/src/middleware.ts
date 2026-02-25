import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Apply locale middleware only to locale entrypoints.
  // Non-localized app routes like /dashboard should bypass this.
  matcher: ['/', '/(fr|pt)/:path*'],
};
