import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockJsPDF, textCalls, saveCalls } = vi.hoisted(() => {
  const textCalls: string[] = [];
  const saveCalls: string[] = [];

  class MockJsPDF {
    currentPage = 1;
    pageCount = 1;
    internal = {
      pageSize: {
        getWidth: () => 595,
        getHeight: () => 842,
      },
    };

    setPage(page: number) {
      this.currentPage = page;
      return this;
    }

    addPage() {
      this.pageCount += 1;
      this.currentPage = this.pageCount;
      return this;
    }

    getNumberOfPages() {
      return this.pageCount;
    }

    setFillColor() { return this; }
    rect() { return this; }
    setTextColor() { return this; }
    setFontSize() { return this; }
    setFont() { return this; }
    setDrawColor() { return this; }
    setLineWidth() { return this; }
    line() { return this; }
    roundedRect() { return this; }

    text(value: string) {
      textCalls.push(value);
      return this;
    }

    save(filename: string) {
      saveCalls.push(filename);
      return this;
    }
  }

  return { MockJsPDF, textCalls, saveCalls };
});

vi.mock('jspdf', () => ({
  default: MockJsPDF,
}));

import { downloadSettlementPdf } from '@/lib/downloadPdf';

describe('downloadSettlementPdf', () => {
  beforeEach(() => {
    textCalls.length = 0;
    saveCalls.length = 0;
  });

  it('renders the real page count in the footer for multi-page settlement PDFs', () => {
    const settlement = {
      id: 'SETTLEMENT-123',
      date: '2026-08-30',
      paymentsCount: 30,
      usdcAmount: 3000,
      fiatAmount: 3000,
      currency: 'USD',
      status: 'completed' as const,
      bankReference: 'REF-001',
      conversionRate: 1,
      fees: 50,
      payments: Array.from({ length: 30 }, (_, index) => ({
        id: `PAY-${index + 1}`,
        amount: 100,
        customer: `Customer ${index + 1}`,
      })),
    };

    downloadSettlementPdf(settlement);

    expect(textCalls).toContain('Page 1 of 2');
    expect(textCalls).toContain('Page 2 of 2');
    expect(textCalls).not.toContain('Page 1 of 1');
  });
});
