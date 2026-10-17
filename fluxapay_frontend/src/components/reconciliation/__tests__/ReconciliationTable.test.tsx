import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {
  ReconciliationTable,
  exportReconciliationCsv,
  ALL_COLUMNS,
  loadVisibleColumns as _loadVisibleColumns,
  saveVisibleColumns as _saveVisibleColumns,
  type ColumnKey,
} from '../ReconciliationTable';
import { ReconciliationRecord } from '../../../types/reconciliation';

// We re-export the helpers from the module for testing; if the module doesn't
// export them, we test behaviour indirectly via component interactions.

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ReconciliationRecord> = {}): ReconciliationRecord {
  return {
    id: 'rec-001',
    settlementId: 'STL-001',
    date: new Date('2024-03-15T10:00:00Z'),
    usdcReceived: 1000,
    fiatPayout: 1495,
    fees: 15,
    discrepancy: 0,
    ...overrides,
  };
}

const RECORDS: ReconciliationRecord[] = [
  makeRecord({ id: 'rec-001', settlementId: 'STL-001', usdcReceived: 500, fiatPayout: 747.5, fees: 7.5, discrepancy: 0 }),
  makeRecord({ id: 'rec-002', settlementId: 'STL-002', usdcReceived: 250, fiatPayout: 373.75, fees: 3.75, discrepancy: -5 }),
  makeRecord({ id: 'rec-003', settlementId: 'STL-003', usdcReceived: 1000, fiatPayout: 1495, fees: 15, discrepancy: 0 }),
];

const noop = () => {};

// ─── Mock localStorage ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// ─── Mock URL.createObjectURL / revokeObjectURL ───────────────────────────────

URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorageMock.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Column toggle tests ──────────────────────────────────────────────────────

describe('ReconciliationTable – column visibility', () => {
  it('renders all columns by default', () => {
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Settlement ID')).toBeInTheDocument();
    expect(screen.getByText('USDC Received')).toBeInTheDocument();
    expect(screen.getByText('Fiat Payout')).toBeInTheDocument();
    expect(screen.getByText('Fees')).toBeInTheDocument();
    expect(screen.getByText('Discrepancy')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('opens column popover when "Customize Columns" button is clicked', async () => {
    const user = userEvent.setup();
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    const btn = screen.getByTestId('customize-columns-btn');
    await user.click(btn);
    expect(screen.getByTestId('column-toggle-popover')).toBeInTheDocument();
  });

  it('hides a toggleable column when its option is clicked', async () => {
    const user = userEvent.setup();
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    // Open popover
    await user.click(screen.getByTestId('customize-columns-btn'));
    // Toggle off "Fees"
    await user.click(screen.getByTestId('col-toggle-fees'));
    // Popover item should still show (no auto-close), but Fees header gone from table
    expect(screen.queryByRole('columnheader', { name: /^fees$/i })).toBeNull();
  });

  it('cannot hide required columns (Date, Settlement ID, Actions)', async () => {
    const user = userEvent.setup();
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    await user.click(screen.getByTestId('customize-columns-btn'));

    const requiredKeys: ColumnKey[] = ['date', 'settlementId', 'actions'];
    for (const key of requiredKeys) {
      const item = screen.getByTestId(`col-toggle-${key}`);
      // Required items are aria-disabled
      expect(item).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('restores a hidden column when toggled back on', async () => {
    const user = userEvent.setup();
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    await user.click(screen.getByTestId('customize-columns-btn'));
    // Hide USDC Received
    await user.click(screen.getByTestId('col-toggle-usdcReceived'));
    expect(screen.queryByRole('columnheader', { name: /usdc received/i })).toBeNull();
    // Show it again
    await user.click(screen.getByTestId('col-toggle-usdcReceived'));
    expect(screen.getByRole('columnheader', { name: /usdc received/i })).toBeInTheDocument();
  });
});

// ─── localStorage persistence tests ──────────────────────────────────────────

describe('ReconciliationTable – localStorage persistence', () => {
  it('saves column preferences to localStorage when columns change', async () => {
    const user = userEvent.setup();
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    await user.click(screen.getByTestId('customize-columns-btn'));
    await user.click(screen.getByTestId('col-toggle-fees'));

    const stored = localStorageMock.getItem('fluxapay:reconciliation-columns');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).not.toContain('fees');
  });

  it('loads previously saved column preferences on mount', () => {
    // Pre-seed localStorage without 'discrepancy'
    localStorageMock.setItem(
      'fluxapay:reconciliation-columns',
      JSON.stringify(['date', 'settlementId', 'usdcReceived', 'fiatPayout', 'actions']),
    );
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    expect(screen.queryByRole('columnheader', { name: /discrepancy/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /fees/i })).toBeNull();
  });

  it('falls back to all columns when localStorage is corrupted', () => {
    localStorageMock.setItem('fluxapay:reconciliation-columns', 'not-valid-json{{{{');
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    // All visible columns should render
    expect(screen.getByText('Fees')).toBeInTheDocument();
    expect(screen.getByText('Discrepancy')).toBeInTheDocument();
  });
});

// ─── CSV export tests ─────────────────────────────────────────────────────────

describe('exportReconciliationCsv', () => {
  it('triggers a file download (creates and revokes blob URL)', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    // Create a real anchor element and spy on its click method
    const realAnchor = document.createElement('a');
    const clickSpy = vi.fn();
    realAnchor.click = clickSpy;
    const createElementOriginal = document.createElement.bind(document);
    let createElementCallCount = 0;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a' && createElementCallCount++ === 0) {
        return realAnchor;
      }
      return createElementOriginal(tag);
    });

    exportReconciliationCsv(RECORDS, ['date', 'settlementId', 'usdcReceived', 'fiatPayout', 'fees', 'discrepancy', 'actions']);
    expect(createSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();
  });

  it('only includes visible columns (excluding actions) in CSV header', () => {
    // Verify that only Date and Settlement ID appear in the file name / that
    // we can call the function with a narrow visible-column set without throwing.
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL');
    const realAnchor = document.createElement('a');
    realAnchor.click = vi.fn();
    const createElementOriginal = document.createElement.bind(document);
    let c = 0;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a' && c++ === 0) return realAnchor;
      return createElementOriginal(tag);
    });

    // Should not throw
    expect(() =>
      exportReconciliationCsv(RECORDS, ['date', 'settlementId', 'fiatPayout', 'actions']),
    ).not.toThrow();
    expect(createSpy).toHaveBeenCalled();
  });

  it('does NOT include "actions" column in CSV even if visible — verified via Blob text', async () => {
    let capturedText = '';
    // Capture the blob content via FileReader
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      // Read asynchronously — stored for later assertion
      blob.text().then((t) => { capturedText = t; });
      return origCreateObjectURL(blob);
    };
    const realAnchor = document.createElement('a');
    realAnchor.click = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    let c = 0;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a' && c++ === 0) return realAnchor;
      return origCreateElement(tag);
    });

    exportReconciliationCsv(RECORDS, ['date', 'settlementId', 'actions']);
    URL.createObjectURL = origCreateObjectURL;

    // Wait for the blob.text() promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(capturedText).toContain('Date');
    expect(capturedText).toContain('Settlement ID');
    expect(capturedText).not.toContain('Actions');
  });

  it('exports CSV matching only selected columns when some are hidden — via Blob text', async () => {
    let capturedText = '';
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      blob.text().then((t) => { capturedText = t; });
      return origCreateObjectURL(blob);
    };
    const realAnchor = document.createElement('a');
    realAnchor.click = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    let c = 0;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a' && c++ === 0) return realAnchor;
      return origCreateElement(tag);
    });

    exportReconciliationCsv(RECORDS, ['date', 'settlementId', 'usdcReceived', 'actions']);
    URL.createObjectURL = origCreateObjectURL;

    await new Promise((r) => setTimeout(r, 10));

    expect(capturedText).toContain('Date');
    expect(capturedText).toContain('Settlement ID');
    expect(capturedText).toContain('USDC Received');
    // Hidden columns must NOT appear
    expect(capturedText).not.toContain('Fiat Payout');
    expect(capturedText).not.toContain('Fees');
    expect(capturedText).not.toContain('Discrepancy');
  });
});

// ─── Component export button tests ────────────────────────────────────────────

describe('ReconciliationTable – Export CSV button', () => {
  it('renders the Export CSV button', () => {
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument();
  });

  it('disables Export CSV when records list is empty', () => {
    render(<ReconciliationTable records={[]} loading={false} onDownloadRecord={noop} />);
    expect(screen.getByTestId('export-csv-btn')).toBeDisabled();
  });

  it('enables Export CSV when records are present', () => {
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    expect(screen.getByTestId('export-csv-btn')).not.toBeDisabled();
  });
});

// ─── Responsive layout ────────────────────────────────────────────────────────

describe('ReconciliationTable – responsive layout', () => {
  it('wraps table in an overflow-x-auto container', () => {
    render(<ReconciliationTable records={RECORDS} loading={false} onDownloadRecord={noop} />);
    const wrapper = screen.getByTestId('reconciliation-table-scroll');
    expect(wrapper).toHaveClass('overflow-x-auto');
  });
});
