/**
 * Simple virtualized table component for rendering large datasets efficiently
 * Only renders visible rows in the viewport
 *
 * Renders a single <table> with a <thead> and <tbody> to maintain correct HTML
 * semantics.  Virtualisation is achieved by adjusting paddingTop / paddingBottom
 * on the <tbody> so the browser keeps the scroll-bar at the right size while
 * only the visible <tr> elements are in the DOM.
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
  /** Optional number of columns – used for the empty-state colSpan. */
  colSpan?: number;
  /** Optional ARIA label for the table element. */
  ariaLabel?: string;
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
  colSpan,
  ariaLabel,
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

  // Padding used on <tbody> to push rows into the right visual position
  // while keeping a single <table>.
  const paddingTop = startIndex * rowHeight;
  const paddingBottom = Math.max(0, totalHeight - (endIndex + 1) * rowHeight);

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
      <table
        className="w-full text-sm text-left"
        role="table"
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      >
        {renderHeader && (
          <thead className="sticky top-0 z-10 bg-background">
            {renderHeader()}
          </thead>
        )}
        <tbody
          style={{
            paddingTop: isEmpty ? 0 : paddingTop,
            paddingBottom: isEmpty ? 0 : paddingBottom,
            display: isEmpty ? undefined : 'block',
          }}
        >
          {isEmpty ? (
            <tr>
              <td colSpan={colSpan ?? 1} className="py-12">
                <EmptyState variant="block" message={emptyMessage} icon={emptyIcon} />
              </td>
            </tr>
          ) : (
            visibleData.map((item, idx) => renderRow(item, startIndex + idx))
          )}
        </tbody>
      </table>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const VirtualizedTable = memo(VirtualizedTableInner) as typeof VirtualizedTableInner;
