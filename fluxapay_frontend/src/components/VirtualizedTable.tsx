/**
 * Simple virtualized table component for rendering large datasets efficiently
 * Only renders visible rows in the viewport
 */

import { useRef, useState, useEffect, memo } from 'react';

interface VirtualizedTableProps<T> {
  data: T[];
  rowHeight: number;
  containerHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  renderHeader?: () => React.ReactNode;
  overscan?: number; // Number of extra rows to render above/below viewport
  className?: string;
}

function VirtualizedTableInner<T>({
  data,
  rowHeight,
  containerHeight,
  renderRow,
  renderHeader,
  overscan = 5,
  className = '',
}: VirtualizedTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate visible range
  const totalHeight = data.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    data.length - 1,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  );

  const visibleData = data.slice(startIndex, endIndex + 1);
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
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleData.map((item, idx) => (
            <div key={startIndex + idx} style={{ height: rowHeight }}>
              {renderRow(item, startIndex + idx)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const VirtualizedTable = memo(VirtualizedTableInner) as typeof VirtualizedTableInner;
