/**
 * Performance optimization utilities for React components.
 *
 * For Core Web Vitals tracking (LCP, CLS, FID, INP), see src/app/lib/reportWebVitals.ts
 * which is initialized in src/app/providers.tsx via useEffect.
 *
 * This file provides runtime optimization techniques (throttle, memoize, render performance tracking)
 * to help components run efficiently and feed into overall Web Vitals.
 */

import { useEffect, useRef } from 'react';

export { useDebounce } from '@/hooks/useDebounce';

/**
 * Hook to track component render performance
 * Logs render time in development mode
 */
export function useRenderPerformance(componentName: string) {
  const renderCount = useRef(0);
  const startTime = useRef(0);

  useEffect(() => {
    renderCount.current += 1;
    
    // Initialize start time on first render
    if (renderCount.current === 1) {
      startTime.current = performance.now();
      return;
    }

    const endTime = performance.now();
    const renderTime = endTime - startTime.current;

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Performance] ${componentName} - Render #${renderCount.current} took ${renderTime.toFixed(2)}ms`
      );
    }

    startTime.current = performance.now();
  });
}

/**
 * Throttle function for scroll and resize events
 * Ensures function is called at most once per specified time period
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Memoization helper for expensive computations
 */
export function memoize<T extends (...args: unknown[]) => unknown>(fn: T): T {
  const cache = new Map();
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

