/**
 * QR code export for payment links (issue #1253).
 *
 * - SVG: the rendered `<svg>` serialized as-is (vector, infinitely scalable).
 * - PNG: a high-resolution (1200 × 1440) branded card, drawn on a canvas:
 *   FluxaPay header, the QR code at 960 px, the link label and URL.
 */

export type QrFormat = "png" | "svg";

export const PNG_WIDTH = 1200;
export const PNG_HEIGHT = 1440;
const QR_SIZE = 960;
const BRAND_COLOR = "#5649DF";

/** Filesystem-safe file name for a link's QR code. */
export function qrFileName(slugOrLabel: string, format: QrFormat): string {
  const base =
    slugOrLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "payment-link";
  return `fluxapay-${base}-qr.${format}`;
}

/** Serialize an `<svg>` element into a standalone SVG document string. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("width")) clone.setAttribute("width", String(QR_SIZE));
  if (!clone.getAttribute("height")) clone.setAttribute("height", String(QR_SIZE));
  const markup = new XMLSerializer().serializeToString(clone);
  return markup.startsWith("<?xml") ? markup : `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

/** Trigger a browser download of `blob` as `fileName`. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render the QR code image"));
    img.src = src;
  });
}

/** Shorten long text to fit `maxWidth` on the canvas, adding an ellipsis. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/** Render the branded PNG card for a payment link. */
export async function renderBrandedPng(
  svgMarkup: string,
  details: { label: string; url: string; amountText?: string },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = PNG_WIDTH;
  canvas.height = PNG_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  const svgUrl = URL.createObjectURL(new Blob([svgMarkup], { type: "image/svg+xml" }));
  try {
    const qr = await loadImage(svgUrl);

    // White card for maximum scan contrast.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PNG_WIDTH, PNG_HEIGHT);

    // Brand header.
    ctx.fillStyle = BRAND_COLOR;
    ctx.fillRect(0, 0, PNG_WIDTH, 120);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FluxaPay", PNG_WIDTH / 2, 62);

    // QR code, crisp edges.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, (PNG_WIDTH - QR_SIZE) / 2, 150, QR_SIZE, QR_SIZE);

    // Caption.
    ctx.fillStyle = "#111827";
    ctx.font = "bold 48px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(fitText(ctx, details.label, PNG_WIDTH - 120), PNG_WIDTH / 2, 1170);
    if (details.amountText) {
      ctx.font = "40px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(details.amountText, PNG_WIDTH / 2, 1235);
    }
    ctx.fillStyle = "#6b7280";
    ctx.font = "28px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(fitText(ctx, details.url, PNG_WIDTH - 120), PNG_WIDTH / 2, 1300);
    ctx.font = "30px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText("Scan to pay with USDC on Stellar", PNG_WIDTH / 2, 1370);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not create the PNG file"))),
      "image/png",
    );
  });
}
