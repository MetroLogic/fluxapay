import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

const renderBrandedPng = vi.fn();
const downloadBlob = vi.fn();
vi.mock('../qrDownload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../qrDownload')>();
  return {
    ...actual,
    renderBrandedPng: (...a: unknown[]) => renderBrandedPng(...a),
    downloadBlob: (...a: unknown[]) => downloadBlob(...a),
  };
});

import { PaymentLinkQRModal } from '../PaymentLinkQRModal';
import { qrFileName } from '../qrDownload';
import { copyText } from '@/lib/clipboard';

const URL_ = 'https://dash.fluxapay.test/api/links/k3j9x2ab/click';

function renderModal(props: Partial<React.ComponentProps<typeof PaymentLinkQRModal>> = {}) {
  const onClose = vi.fn();
  render(
    <PaymentLinkQRModal
      isOpen
      onClose={onClose}
      url={URL_}
      label="Pro plan"
      slug="k3j9x2ab"
      amountText="$25.00 USD"
      {...props}
    />,
  );
  return { onClose };
}

describe('qrFileName', () => {
  it('builds safe, branded file names', () => {
    expect(qrFileName('k3j9x2ab', 'png')).toBe('fluxapay-k3j9x2ab-qr.png');
    expect(qrFileName('Pro Plan / Monthly!', 'svg')).toBe('fluxapay-pro-plan-monthly-qr.svg');
    expect(qrFileName('***', 'png')).toBe('fluxapay-payment-link-qr.png');
  });
});

describe('copyText', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the Clipboard API is unavailable or rejects', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof execCommand }).execCommand = execCommand;

    await expect(copyText('fallback')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    // The temporary textarea is cleaned up.
    expect(document.querySelector('textarea')).toBeNull();

    execCommand.mockReturnValue(false);
    await expect(copyText('nope')).resolves.toBe(false);
  });
});

describe('PaymentLinkQRModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('renders a high-contrast QR code of the payment URL', () => {
    renderModal();
    const qr = screen.getByRole('img', { name: 'QR code for payment link Pro plan' });
    expect(qr.tagName.toLowerCase()).toBe('svg');
    expect(screen.getByRole('heading', { name: 'Pro plan' })).toBeInTheDocument();
    expect(screen.getByLabelText('Shareable URL')).toHaveValue(URL_);
    expect(screen.getByText('$25.00 USD')).toBeInTheDocument();
  });

  it('uses the creation heading right after a link is created', () => {
    renderModal({ justCreated: true });
    expect(screen.getByRole('heading', { name: 'Payment Link Created' })).toBeInTheDocument();
  });

  it('copies the link with toast and inline feedback', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Copied to clipboard!'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL_);
    expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument();
  });

  it('downloads a branded PNG by default', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    renderBrandedPng.mockResolvedValue(png);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /download qr code/i }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(png, 'fluxapay-k3j9x2ab-qr.png'));
    const [svgMarkup, details] = renderBrandedPng.mock.calls[0];
    expect(svgMarkup).toContain('<svg');
    expect(details).toEqual({ label: 'Pro plan', url: URL_, amountText: '$25.00 USD' });
    expect(toastSuccess).toHaveBeenCalledWith('QR code downloaded (PNG)');
  });

  it('downloads a vector SVG when SVG is selected (keyboard-selectable radio)', async () => {
    renderModal();
    const svgOption = screen.getByRole('radio', { name: /svg/i });
    svgOption.focus();
    fireEvent.click(svgOption);
    expect(svgOption).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /download qr code/i }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
    const [blob, name] = downloadBlob.mock.calls[0];
    expect(name).toBe('fluxapay-k3j9x2ab-qr.svg');
    expect((blob as Blob).type).toBe('image/svg+xml');
    expect(renderBrandedPng).not.toHaveBeenCalled();
  });

  it('reports a PNG rendering failure', async () => {
    renderBrandedPng.mockRejectedValue(new Error('Canvas is not supported in this browser'));
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /download qr code/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Canvas is not supported in this browser'),
    );
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
