/**
 * Simple virtualized table component for rendering large datasets efficiently
 * Only renders visible rows in the viewport
 */

import { useRef, useState, useEffect, memo } from 'react';
import EmptyState from './EmptyState';

interface VirtualizedTableProps<T> {
  /**
   * Rows to render. Tolerates `undefined` and `null` so a table bound directly
   * to an in-flight or failed request renders its empty state instead of
   * throwing on `.length`.
   */
  data?: T[] | null;
  rowHeight: number;
  containerHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  renderHeader?: () => React.ReactNode;
  overscan?: number; // Number of extra rows to render above/below viewport
  className?: string;
  /** Message shown when there are no rows. */
  emptyMessage?: string;
  /** Optional icon shown above the empty message. */
  emptyIcon?: React.ReactNode;
}

function VirtualizedTableInner<T>({
  data,
  rowHeight,
  containerHeight,
  renderRow,
  renderHeader,
  overscan = 5,
  className = '',
  emptyMessage = 'No data available.',
  emptyIcon,
}: VirtualizedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Normalised once so every calculation below is safe even when the caller
  // passes nothing at all.
  const rows: T[] = Array.isArray(data) ? data : [];
  const isEmpty = rows.length === 0;

  // Calculate visible range
  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    rows.length - 1,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  );

  const visibleData = rows.slice(startIndex, endIndex + 1);
  const offsetY = startIndex * rowHeight;

  // Scroll handler with manual throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    let lastScrollTop = 0;

    const handleScroll = () => {
      if (rafId !== null) return;
      
      rafId = requestAnimationFrame(() => {
        const currentScrollTop = container.scrollTop;
        if (currentScrollTop !== lastScrollTop) {
          setScrollTop(currentScrollTop);
          lastScrollTop = currentScrollTop;
        }
        rafId = null;
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
    >
      {renderHeader && (
        <div className="sticky top-0 z-10 bg-background">
          {renderHeader()}
        </div>
      )}
      {isEmpty ? (
        <EmptyState variant="block" className="py-12" message={emptyMessage} icon={emptyIcon} />
      ) : (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleData.map((item, idx) => (
              <div key={startIndex + idx} style={{ height: rowHeight }}>
                {renderRow(item, startIndex + idx)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const VirtualizedTable = memo(VirtualizedTableInner) as typeof VirtualizedTableInner;
