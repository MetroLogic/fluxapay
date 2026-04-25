import { Button } from "@/components/Button";

export type TablePaginationBarProps = {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
};

/**
 * Consistent “Showing X–Y of Z” and prev/next controls for server-driven lists.
 */
export function TablePaginationBar({
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
  className = "",
}: TablePaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 text-sm text-muted-foreground border-t border-border/60 ${className}`.trim()}
    >
      <p>
        {total === 0
          ? "No results"
          : `Showing ${start}–${end} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-xs tabular-nums px-1">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page >= totalPages || loading || total === 0}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
