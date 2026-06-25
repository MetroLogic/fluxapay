import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Renders above the main content (e.g. filters) */
  toolbar?: ReactNode;
  /** Renders below the main content (e.g. pagination) */
  footer?: ReactNode;
};

/**
 * Consistent card shell for list pages: payments, invoices, webhooks, settlements.
 */
export function DataTableCard({ children, className = "", toolbar, footer }: Props) {
  return (
    <div className={`bg-card rounded-2xl border shadow-sm overflow-hidden ${className}`.trim()}>
      {toolbar}
      {children}
      {footer}
    </div>
  );
}
