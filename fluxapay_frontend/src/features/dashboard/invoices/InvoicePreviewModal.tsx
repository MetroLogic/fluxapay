"use client";

import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeCanvas } from "qrcode.react";
import toast from "react-hot-toast";
import { Download, Pencil, Send, ZoomIn, ZoomOut, X } from "lucide-react";
import { Button } from "@/components/Button";
import {
  type InvoicePreviewData,
  computeInvoiceTotals,
  formatDate,
  formatMoney,
} from "./invoicePreview";
import { buildInvoicePdf, invoicePdfFileName } from "./invoicePdf";

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Catches errors thrown while rendering the invoice sheet. */
class PreviewErrorBoundary extends Component<
  { children: React.ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700" role="alert">
          <p className="font-medium">We couldn&apos;t render the invoice preview.</p>
          <p className="mt-1">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-3 underline"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry();
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** The invoice "paper", laid out like the PDF. */
export function InvoiceSheet({
  data,
  qrRef,
}: {
  data: InvoicePreviewData;
  qrRef?: React.Ref<HTMLDivElement>;
}) {
  const totals = useMemo(
    () => computeInvoiceTotals(data.lineItems, data.taxRate ?? 0, data.currency),
    [data.lineItems, data.taxRate, data.currency],
  );
  const money = (n: number) => formatMoney(n, data.currency);
  const qrValue = data.paymentUrl ?? `fluxapay:invoice-preview:${data.customerEmail}`;

  return (
    <article
      className="mx-auto w-full max-w-[794px] bg-white text-slate-900 shadow-lg"
      aria-label="Invoice preview"
      data-testid="invoice-sheet"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 bg-slate-900 px-8 py-6 text-white">
        <div>
          <h3 className="text-xl font-bold">{data.merchant.businessName}</h3>
          <p className="text-xs tracking-widest text-slate-300">INVOICE</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{data.invoiceNumber ?? "DRAFT"}</p>
          <p className="text-xs text-slate-300">Issued {formatDate(data.issueDate ?? new Date().toISOString())}</p>
        </div>
      </header>

      <div className="space-y-6 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">From</p>
            <p className="font-medium">{data.merchant.businessName}</p>
            {data.merchant.email && <p className="text-slate-600">{data.merchant.email}</p>}
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Bill to</p>
            <p className="font-medium">{data.customerName}</p>
            <p className="text-slate-600">{data.customerEmail}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Due date</p>
            <p className="font-medium">{formatDate(data.dueDate)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Currency</p>
            <p className="font-medium">{data.currency}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                <th scope="col" className="px-3 py-2">Description</th>
                <th scope="col" className="px-3 py-2 text-right">Qty</th>
                <th scope="col" className="px-3 py-2 text-right">Unit price</th>
                <th scope="col" className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {totals.lines.map((line, i) => (
                <tr key={i} className="border-b border-slate-100" data-testid="invoice-line">
                  <td className="px-3 py-2">{line.description || "—"}</td>
                  <td className="px-3 py-2 text-right">{line.quantity}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{money(line.unit_price)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{money(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Subtotal</dt>
            <dd data-testid="invoice-subtotal">{money(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Tax ({totals.taxRate}%)</dt>
            <dd data-testid="invoice-tax">{money(totals.taxAmount)}</dd>
          </div>
          <div className="flex justify-between border-t border-indigo-500 pt-2 text-base font-bold">
            <dt>Total due</dt>
            <dd data-testid="invoice-total">{money(totals.total)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          <div ref={qrRef} className="relative rounded border border-slate-200 bg-white p-2">
            <QRCodeCanvas
              value={qrValue}
              size={112}
              level="M"
              role="img"
              aria-label={data.paymentUrl ? "Payable Stellar QR code" : "Sample payment QR code"}
            />
            {!data.paymentUrl && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="rotate-[-20deg] rounded bg-white/85 px-1 text-[10px] font-bold tracking-widest text-slate-500">
                  PREVIEW
                </span>
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {data.paymentUrl ? (
              <>
                <p className="font-medium text-slate-700">Scan to pay with USDC on Stellar</p>
                <p className="break-all">{data.paymentUrl}</p>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-700">Payable Stellar QR code</p>
                <p>The live payment QR code is generated when the invoice is sent to the customer.</p>
              </>
            )}
            {data.notes && <p className="mt-2 whitespace-pre-wrap text-slate-600">Notes: {data.notes}</p>}
          </div>
        </div>
      </div>
    </article>
  );
}

interface InvoicePreviewModalProps {
  isOpen: boolean;
  /** `null` while the merchant details are still loading. */
  data: InvoicePreviewData | null;
  loadError?: string | null;
  sending?: boolean;
  onEdit: () => void;
  onSend: () => void;
}

/**
 * Invoice preview dialog (issue #1254): the formatted invoice with zoom and
 * scroll, plus "Edit Details", "Download PDF" and "Send to Customer".
 */
export function InvoicePreviewModal({
  isOpen,
  data,
  loadError,
  sending = false,
  onEdit,
  onSend,
}: InvoicePreviewModalProps) {
  const [zoomIndex, setZoomIndex] = useState(ZOOM_LEVELS.indexOf(1));
  const [downloading, setDownloading] = useState(false);
  const [renderKey, setRenderKey] = useState(0);
  const qrRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const zoom = ZOOM_LEVELS[zoomIndex];

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => dialogRef.current?.focus(), 0);
    // Capture on window so Esc/Tab are handled here first and never reach
    // the document-level listeners of the create-invoice Modal underneath
    // (which would close it, or pull focus back into the form).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onEdit();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        e.stopPropagation();
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [isOpen, onEdit]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleDownload = async () => {
    if (!data) return;
    setDownloading(true);
    try {
      let qrDataUrl: string | null = null;
      try {
        qrDataUrl = qrRef.current?.querySelector("canvas")?.toDataURL("image/png") ?? null;
      } catch {
        qrDataUrl = null;
      }
      buildInvoicePdf(data, qrDataUrl).save(invoicePdfFileName(data));
      toast.success("Invoice PDF downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? `Couldn't generate the PDF: ${err.message}` : "Couldn't generate the PDF");
    } finally {
      setDownloading(false);
    }
  };

  // Portalled to <body> so it is never clipped or offset by the (animated,
  // transformed) create-invoice dialog it is opened from.
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" onClick={onEdit} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-preview-title"
        tabIndex={-1}
        className="relative flex max-h-[95vh] w-full max-w-5xl flex-col rounded-2xl border border-border bg-background shadow-2xl outline-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
          <h2 id="invoice-preview-title" className="text-lg font-bold">
            Invoice preview
          </h2>
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </Button>
            <button
              type="button"
              className="min-w-14 rounded px-2 py-1 text-sm tabular-nums hover:bg-secondary"
              onClick={() => setZoomIndex(ZOOM_LEVELS.indexOf(1))}
              aria-label="Reset zoom"
              data-testid="zoom-level"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label="Close preview">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 p-3 sm:p-6" data-testid="invoice-preview-scroll">
          {loadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700" role="alert">
              {loadError}
            </div>
          ) : !data ? (
            <div className="py-16 text-center text-sm text-muted-foreground" role="status">
              Preparing invoice preview…
            </div>
          ) : (
            <div style={{ zoom }} data-testid="invoice-zoom">
              <PreviewErrorBoundary key={renderKey} onRetry={() => setRenderKey((k) => k + 1)}>
                <InvoiceSheet data={data} qrRef={qrRef} />
              </PreviewErrorBoundary>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="secondary" onClick={onEdit} className="gap-2">
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit Details
          </Button>
          <Button type="button" variant="outline" onClick={handleDownload} disabled={!data || downloading} className="gap-2">
            <Download className="h-4 w-4" aria-hidden="true" />
            {downloading ? "Generating…" : "Download PDF"}
          </Button>
          <Button type="button" onClick={onSend} disabled={!data || sending} className="gap-2">
            <Send className="h-4 w-4" aria-hidden="true" />
            {sending ? "Sending…" : "Send to Customer"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
