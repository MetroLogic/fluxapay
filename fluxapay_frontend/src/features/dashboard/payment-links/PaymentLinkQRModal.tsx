"use client";

import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { Check, Copy, Download } from "lucide-react";
import { Modal } from "@/components/Modal";
import { copyText } from "@/lib/clipboard";
import {
  type QrFormat,
  downloadBlob,
  qrFileName,
  renderBrandedPng,
  serializeSvg,
} from "./qrDownload";

export interface PaymentLinkQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Public URL the QR code encodes. */
  url: string;
  label: string;
  slug: string;
  /** e.g. "$25.00 USD", shown under the QR and on the PNG. */
  amountText?: string;
  /** True right after creation, to adjust the heading. */
  justCreated?: boolean;
}

/**
 * Payment link QR modal (issue #1253): high-contrast QR code of the payment
 * URL, download as branded PNG or vector SVG, and copy-to-clipboard with
 * feedback. Built on the shared `Modal`, which traps focus and closes on Esc.
 */
export function PaymentLinkQRModal({
  isOpen,
  onClose,
  url,
  label,
  slug,
  amountText,
  justCreated = false,
}: PaymentLinkQRModalProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<QrFormat>("png");
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Couldn't copy automatically — select the link and copy it manually.");
    }
  };

  const handleDownload = async () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) {
      toast.error("QR code is not ready yet");
      return;
    }
    setDownloading(true);
    try {
      const markup = serializeSvg(svg);
      const fileName = qrFileName(slug || label, format);
      if (format === "svg") {
        downloadBlob(new Blob([markup], { type: "image/svg+xml" }), fileName);
      } else {
        const png = await renderBrandedPng(markup, { label, url, amountText });
        downloadBlob(png, fileName);
      }
      toast.success(`QR code downloaded (${format.toUpperCase()})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download the QR code");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={justCreated ? "Payment Link Created" : label}>
      <div className="flex flex-col items-center gap-4" data-testid="payment-link-qr-modal">
        <div ref={qrRef} className="rounded-lg border border-gray-200 bg-white p-4">
          <QRCodeSVG
            value={url}
            size={220}
            level="H"
            fgColor="#000000"
            bgColor="#ffffff"
            marginSize={2}
            role="img"
            aria-label={`QR code for payment link ${label}`}
            title={`QR code for ${url}`}
          />
        </div>
        {amountText && <p className="text-sm font-medium text-gray-700">{amountText}</p>}

        <div className="w-full">
          <label htmlFor="payment-link-url" className="mb-1 block text-sm text-gray-600">
            Shareable URL
          </label>
          <div className="flex min-w-0 gap-2">
            <input
              id="payment-link-url"
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full min-w-0 rounded border bg-gray-50 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
          <p className="sr-only" aria-live="polite">
            {copied ? "Link copied to clipboard" : ""}
          </p>
        </div>

        <fieldset className="w-full">
          <legend className="mb-1 text-sm text-gray-600">Download format</legend>
          <div className="flex items-center gap-4">
            {(["png", "svg"] as const).map((f) => (
              <label key={f} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="qr-format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                {f === "png" ? "PNG (high-res, branded)" : "SVG (vector)"}
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex w-full items-center justify-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {downloading ? "Preparing…" : "Download QR Code"}
        </button>
      </div>
    </Modal>
  );
}
