/**
 * Loading state for webhooks page.
 * Displays a skeleton matching the webhooks logs table layout.
 */

export default function WebhooksLoading() {
  return (
    <div className="space-y-6" data-testid="webhooks-loading">
      {/* Header skeleton */}
      <div className="flex items-center justify-between gap-4">
        <div className="h-9 w-56 bg-slate-200 animate-pulse rounded-lg" />
        <div className="h-10 w-32 bg-slate-200 animate-pulse rounded-lg" />
      </div>

      {/* Filter skeleton */}
      <div className="flex gap-3">
        <div className="h-10 w-40 bg-slate-200 animate-pulse rounded-lg" />
        <div className="h-10 w-40 bg-slate-200 animate-pulse rounded-lg" />
        <div className="h-10 w-40 bg-slate-200 animate-pulse rounded-lg" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        {/* Table header */}
        <div className="bg-slate-50 border-b border-slate-200 grid grid-cols-6 gap-4 p-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-4 bg-slate-200 animate-pulse rounded"
            />
          ))}
        </div>

        {/* Table rows */}
        {[...Array(5)].map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="border-b border-slate-100 grid grid-cols-6 gap-4 p-4"
          >
            {[...Array(6)].map((_, colIdx) => (
              <div
                key={colIdx}
                className="h-4 bg-slate-100 animate-pulse rounded"
              />
            ))}
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 bg-slate-200 animate-pulse rounded" />
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-9 w-9 bg-slate-200 animate-pulse rounded"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
