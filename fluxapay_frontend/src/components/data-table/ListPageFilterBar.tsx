import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** When true, use a vertical stack (e.g. presets row + search row). */
  stack?: boolean;
};

const barClasses =
  "p-4 sm:p-6 border-b border-border/60 bg-muted/20";

/**
 * Shared filter row: same padding, border, and background as other dashboard list pages.
 */
export function ListPageFilterBar({ children, className = "", stack = false }: Props) {
  const layout = stack
    ? "flex flex-col gap-4"
    : "flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3";
  return (
    <div className={`${layout} ${barClasses} ${className}`.trim()}>{children}</div>
  );
}
