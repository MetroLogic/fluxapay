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

  it('re-renders QR code when depositAddress prop changes', () => {
    const { rerender } = render(<PaymentQRCode address={address} amount={25} />);

    const canvas1 = screen.getByTestId('qr-canvas');
    // The value prop on the canvas encodes the Stellar URI — capture it
    const initialValue = canvas1.getAttribute('value');

    const newAddress = 'GNEWADDRESS99999STELLARADDR';
    rerender(<PaymentQRCode address={newAddress} amount={25} />);

    const canvas2 = screen.getByTestId('qr-canvas');
    const updatedValue = canvas2.getAttribute('value');

    // The QR value must have changed to reflect the new deposit address
    expect(updatedValue).not.toBe(initialValue);
    expect(updatedValue).toContain(newAddress);
  });

  it('re-renders QR code when memo prop changes', () => {
    const { rerender } = render(<PaymentQRCode address={address} amount={25} memoType="text" memo="MEMO123" />);

    const canvas1 = screen.getByTestId('qr-canvas');
    const initialValue = canvas1.getAttribute('value');
    expect(initialValue).toContain('memo=MEMO123');

    rerender(<PaymentQRCode address={address} amount={25} memoType="text" memo="MEMO999" />);

    const canvas2 = screen.getByTestId('qr-canvas');
    const updatedValue = canvas2.getAttribute('value');

    expect(updatedValue).not.toBe(initialValue);
    expect(updatedValue).toContain('memo=MEMO999');
  });
});
