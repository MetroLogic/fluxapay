import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Columns to span. Required for the default table-row variant. */
  colSpan?: number;
  message?: string;
  className?: string;
  /**
   * `"row"` (default) renders a `<tr><td>` for use inside a `<tbody>`.
   * `"block"` renders a `<div>` for callers that are not real table markup —
   * a `<tr>` nested in a `<div>` is invalid DOM and React warns about it.
   */
  variant?: "row" | "block";
  /** Optional illustration or icon shown above the message. */
  icon?: ReactNode;
}

export default function EmptyState({
  colSpan,
  message = "No data available.",
  className = "py-8",
  variant = "row",
  icon,
}: EmptyStateProps) {
  const body = (
    <>
      {icon ? (
        <div className="mb-2 flex justify-center" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      {message}
    </>
  );

  if (variant === "block") {
    return (
      <div className={`text-center text-gray-400 ${className}`} role="status">
        {body}
      </div>
    );
  }

  return (
    <tr>
      <td colSpan={colSpan} className={`text-center text-gray-400 ${className}`}>
        {body}
      </td>
    </tr>
  );
}
