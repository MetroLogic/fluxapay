import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { PaymentQRCode } from '../PaymentQRCode';

vi.mock('qrcode.react', () => ({
  QRCodeCanvas: (props: Record<string, unknown>) => (
    <canvas data-testid="qr-canvas" {...props} />
  ),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
  },
}));

describe('PaymentQRCode', () => {
  const address = 'GABCDEF123456789STELLARADDRESS';

  it('renders QR code with descriptive alt text including deposit address', () => {
    render(<PaymentQRCode address={address} amount={25} />);

    const qr = screen.getByRole('img', {
      name: `QR code for Stellar payment of 25 to deposit address ${address}`,
    });
    expect(qr).toBeInTheDocument();
  });

  it('uses Copy deposit address aria-label on address copy button', () => {
    render(<PaymentQRCode address={address} amount={25} />);

    expect(
      screen.getByRole('button', { name: 'Copy deposit address' }),
    ).toBeInTheDocument();
  });
});
