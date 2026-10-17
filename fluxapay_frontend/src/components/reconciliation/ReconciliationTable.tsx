import React, { useState, useCallback, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { VirtualizedTable } from '../VirtualizedTable';
import { ReconciliationRecord } from '../../types/reconciliation';
import { SlidersHorizontal, Download, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { escapeCsvCell } from '@/lib/downloadCsv';

// ─── Column definitions ───────────────────────────────────────────────────────

export type ColumnKey =
  | 'date'
  | 'settlementId'
  | 'usdcReceived'
  | 'fiatPayout'
  | 'fees'
  | 'discrepancy'
  | 'actions';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  /** Columns marked `required` cannot be hidden */
  required?: boolean;
  align?: 'left' | 'right';
}

export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'date',         label: 'Date',           required: true,  align: 'left'  },
  { key: 'settlementId', label: 'Settlement ID',  required: true,  align: 'left'  },
  { key: 'usdcReceived', label: 'USDC Received',                   align: 'right' },
  { key: 'fiatPayout',   label: 'Fiat Payout',                     align: 'right' },
  { key: 'fees',         label: 'Fees',                            align: 'right' },
  { key: 'discrepancy',  label: 'Discrepancy',                     align: 'right' },
  { key: 'actions',      label: 'Actions',        required: true,  align: 'right' },
];

const STORAGE_KEY = 'fluxapay:reconciliation-columns';

const DEFAULT_VISIBLE: ColumnKey[] = ALL_COLUMNS.map((c) => c.key);

// ─── Persistence helpers ──────────────────────────────────────────────────────

export function loadVisibleColumns(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE;
    // Filter out any stale keys that no longer exist
    const valid = parsed.filter((k) =>
      ALL_COLUMNS.some((c) => c.key === k),
    ) as ColumnKey[];
    // Always include required columns
    for (const col of ALL_COLUMNS) {
      if (col.required && !valid.includes(col.key)) valid.push(col.key);
    }
    return valid.length > 0 ? valid : DEFAULT_VISIBLE;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

export function saveVisibleColumns(cols: ColumnKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
  } catch {
    // Silently fail (e.g., private browsing with storage full)
  }
}

// ─── CSV export ───────────────────────────────────────────────────────────────

/**
 * Build and trigger a CSV download for the current set of visible columns.
 * The `actions` column is excluded from exports since it contains UI controls.
 */
export function exportReconciliationCsv(
  records: ReconciliationRecord[],
  visibleColumns: ColumnKey[],
): void {
  const exportColumns = visibleColumns.filter((k) => k !== 'actions');
  const colDefs = ALL_COLUMNS.filter((c) => exportColumns.includes(c.key));

  const header = colDefs.map((c) => escapeCsvCell(c.label)).join(',');

  const rows = records.map((record) => {
    return colDefs
      .map((c) => {
        switch (c.key) {
          case 'date':
            return escapeCsvCell(format(record.date, 'yyyy-MM-dd HH:mm:ss'));
          case 'settlementId':
            return escapeCsvCell(record.settlementId);
          case 'usdcReceived':
            return escapeCsvCell(record.usdcReceived.toFixed(2));
          case 'fiatPayout':
            return escapeCsvCell(record.fiatPayout.toFixed(2));
          case 'fees':
            return escapeCsvCell(record.fees.toFixed(2));
          case 'discrepancy':
            return escapeCsvCell(record.discrepancy.toFixed(2));
          default:
            return escapeCsvCell('');
        }
      })
      .join(',');
  });

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reconciliation-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Column visibility popover ────────────────────────────────────────────────

interface ColumnToggleProps {
  visibleColumns: ColumnKey[];
  onChange: (cols: ColumnKey[]) => void;
}

function ColumnTogglePopover({ visibleColumns, onChange }: ColumnToggleProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function toggle(key: ColumnKey) {
    const col = ALL_COLUMNS.find((c) => c.key === key);
    if (col?.required) return; // Required columns cannot be hidden
    const next = visibleColumns.includes(key)
      ? visibleColumns.filter((k) => k !== key)
      : [...visibleColumns, key];
    // Preserve original column order
    onChange(ALL_COLUMNS.map((c) => c.key).filter((k) => next.includes(k)));
  }

  return (
    <div className="relative" ref={ref} data-testid="column-toggle-container">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Customize columns"
        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        data-testid="customize-columns-btn"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Customize Columns
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Column visibility options"
          aria-multiselectable="true"
          className="absolute right-0 z-10 mt-2 w-52 origin-top-right rounded-md border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
          data-testid="column-toggle-popover"
        >
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Toggle Columns
            </p>
          </div>
          <ul className="py-1" role="presentation">
            {ALL_COLUMNS.map((col) => {
              const visible = visibleColumns.includes(col.key);
              return (
                <li
                  key={col.key}
                  role="option"
                  aria-selected={visible}
                  onClick={() => toggle(col.key)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${
                    col.required ? 'cursor-default opacity-60' : ''
                  }`}
                  data-testid={`col-toggle-${col.key}`}
                  aria-disabled={col.required}
                >
                  <span>{col.label}</span>
                  <span className="flex items-center gap-1">
                    {col.required && (
                      <span className="text-[10px] text-gray-400">required</span>
                    )}
                    {visible && (
                      <Check className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  records: ReconciliationRecord[];
  loading: boolean;
  onDownloadRecord: (record: ReconciliationRecord) => void;
}

const formatCurrency = (amount: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

export function ReconciliationTable({ records, loading, onDownloadRecord }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(loadVisibleColumns);
  const recordsPerPage = 10;
  const shouldVirtualize = records.length > 100;

  const totalPages = Math.ceil(records.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const currentRecords = records.slice(startIndex, startIndex + recordsPerPage);

  // Persist column preferences whenever they change
  useEffect(() => {
    saveVisibleColumns(visibleColumns);
  }, [visibleColumns]);

  // Reset page to 1 when records change
  useEffect(() => {
    setCurrentPage(1);
  }, [records]);

  const handleColumnChange = useCallback((cols: ColumnKey[]) => {
    setVisibleColumns(cols);
  }, []);

  const handleExport = useCallback(() => {
    exportReconciliationCsv(records, visibleColumns);
  }, [records, visibleColumns]);

  // The ordered visible columns for this render pass
  const orderedVisible = ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key));

  function renderCell(record: ReconciliationRecord, key: ColumnKey): React.ReactNode {
    const hasDiscrepancy = Math.abs(record.discrepancy) > 0.01;
    switch (key) {
      case 'date':
        return (
          <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
            {format(record.date, 'MMM d, yyyy HH:mm')}
          </td>
        );
      case 'settlementId':
        return (
          <td key={key} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
            {record.settlementId}
          </td>
        );
      case 'usdcReceived':
        return (
          <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
            {record.usdcReceived.toFixed(2)}
          </td>
        );
      case 'fiatPayout':
        return (
          <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
            {formatCurrency(record.fiatPayout)}
          </td>
        );
      case 'fees':
        return (
          <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
            {formatCurrency(record.fees)}
          </td>
        );
      case 'discrepancy':
        return (
          <td
            key={key}
            className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
              hasDiscrepancy ? 'text-red-600' : 'text-gray-900'
            }`}
          >
            {formatCurrency(record.discrepancy)}
          </td>
        );
      case 'actions':
        return (
          <td key={key} className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <button
              onClick={() => onDownloadRecord(record)}
              className="text-indigo-600 hover:text-indigo-900"
            >
              Download PDF
            </button>
          </td>
        );
    }
  }

  const renderRecordRow = useCallback(
    (record: ReconciliationRecord) => {
      const hasDiscrepancy = Math.abs(record.discrepancy) > 0.01;
      return (
        <tr
          key={record.id}
          className={hasDiscrepancy ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}
        >
          {orderedVisible.map((col) => renderCell(record, col.key))}
        </tr>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderedVisible, onDownloadRecord],
  );

  const renderHeader = useCallback(
    () => (
      <tr>
        {orderedVisible.map((col) => (
          <th
            key={col.key}
            scope="col"
            className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
              col.align === 'right' ? 'text-right' : 'text-left'
            }`}
          >
            {col.label}
          </th>
        ))}
      </tr>
    ),
    [orderedVisible],
  );

  // ── Toolbar ──────────────────────────────────────────────────────────────────
  const Toolbar = (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 flex-wrap">
      <ColumnTogglePopover
        visibleColumns={visibleColumns}
        onChange={handleColumnChange}
      />
      <button
        type="button"
        onClick={handleExport}
        disabled={records.length === 0}
        aria-label="Export CSV"
        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        data-testid="export-csv-btn"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export CSV
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 animate-pulse rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {Toolbar}
        <div className="p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No reconciliation records found
          </h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your date range.</p>
        </div>
      </div>
    );
  }

  if (shouldVirtualize) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {Toolbar}
        <div className="overflow-x-auto">
          <VirtualizedTable
            data={records}
            rowHeight={56}
            containerHeight={600}
            colSpan={orderedVisible.length}
            ariaLabel="Reconciliation records"
            renderHeader={renderHeader}
            renderRow={(record) => renderRecordRow(record)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      {Toolbar}

      {/* Responsive: horizontal scroll on small viewports */}
      <div className="overflow-x-auto" data-testid="reconciliation-table-scroll">
        <table
          className="min-w-full divide-y divide-gray-200"
          aria-label="Reconciliation records"
          data-testid="reconciliation-table"
        >
          <thead className="bg-gray-50">{renderHeader()}</thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentRecords.map((record) => renderRecordRow(record))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <p className="text-sm text-gray-700">
            Showing{' '}
            <span className="font-medium">{startIndex + 1}</span> to{' '}
            <span className="font-medium">
              {Math.min(startIndex + recordsPerPage, records.length)}
            </span>{' '}
            of <span className="font-medium">{records.length}</span> results
          </p>
          <nav
            className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
            aria-label="Pagination"
          >
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              data-testid="pagination-prev"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              data-testid="pagination-next"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
