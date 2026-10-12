/**
 * Next.js instrumentation hook for performance monitoring
 * Registers client-side Web Vitals reporting
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side initialization (if needed in future)
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime initialization (if needed in future)
  }
}

// Client-side hook - initialize Web Vitals reporting
if (typeof window !== 'undefined') {
  // Import here to ensure it only runs in the browser
  import('@/app/lib/reportWebVitals').then(({ initWebVitalsReporting }) => {
    initWebVitalsReporting();
  }).catch(err => {
    console.error('Failed to initialize Web Vitals reporting:', err);
  });
}
