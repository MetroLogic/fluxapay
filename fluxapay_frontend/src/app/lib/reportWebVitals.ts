/**
 * Next.js Web Vitals reporting hook
 * Captures Core Web Vitals (LCP, CLS, FID, INP) and sends them to Sentry.
 *
 * Install in next.config.ts via:
 *   export const experimental = {
 *     instrumentationHook: true,
 *   };
 *
 * Then import in instrumentation.ts:
 *   export { webVitalsReporter } from '@/app/lib/reportWebVitals';
 */

import { getCLS, getFID, getFCP, getLCP, getINP, Metric } from 'web-vitals';
import * as Sentry from '@sentry/nextjs';

/**
 * Send a Web Vital metric to Sentry as a custom measurement
 */
function reportWebVital(metric: Metric) {
  // Add to Sentry transaction if available
  if (typeof window !== 'undefined' && Sentry.getCurrentHub().getScope()) {
    Sentry.captureMessage(`Web Vital: ${metric.name}`, 'info', {
      tags: {
        webVital: metric.name,
      },
      measurements: {
        [metric.name]: {
          value: metric.value,
        },
      },
      extra: {
        id: metric.id,
        rating: metric.rating,
        navigationType: metric.navigationType,
      },
    });
  }

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Web Vital] ${metric.name}: ${metric.value.toFixed(2)}ms (${metric.rating})`);
  }
}

/**
 * Initialize Web Vitals observers.
 * Call this function early in the client-side initialization (e.g., in _app or layout).
 */
export function initWebVitalsReporting() {
  if (typeof window === 'undefined') return;

  // Largest Contentful Paint (LCP)
  // Measures when the largest content element becomes visible
  // Good: < 2.5s, Needs Improvement: 2.5s - 4s, Poor: > 4s
  getLCP(reportWebVital);

  // Cumulative Layout Shift (CLS)
  // Measures visual stability
  // Good: < 0.1, Needs Improvement: 0.1 - 0.25, Poor: > 0.25
  getCLS(reportWebVital);

  // First Input Delay (FID) - deprecated, replaced by INP in newer versions
  // Measures responsiveness to user interactions
  // Good: < 100ms, Needs Improvement: 100ms - 300ms, Poor: > 300ms
  getFID(reportWebVital);

  // Interaction to Next Paint (INP)
  // Measures responsiveness to all interactions
  // Good: < 200ms, Needs Improvement: 200ms - 500ms, Poor: > 500ms
  getINP(reportWebVital);

  // First Contentful Paint (FCP)
  // Marks when the browser renders the first content
  // Good: < 1.8s, Needs Improvement: 1.8s - 3s, Poor: > 3s
  getFCP(reportWebVital);
}

/**
 * For use with NextJs reportWebVitals callback (if not using instrumentation.ts)
 * Can be added to next.config.ts as:
 *   export function reportWebVitals(metric) {
 *     // Example: Send to analytics endpoint
 *   }
 */
export function reportWebVitalsCallback(metric: Metric) {
  // This can be used as an alternative to initWebVitalsReporting
  // if you prefer the Next.js reportWebVitals hook pattern
  reportWebVital(metric);
}
