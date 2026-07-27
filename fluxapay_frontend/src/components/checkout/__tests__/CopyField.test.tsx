import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CopyField } from '../CopyField';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CopyField', () => {
  const address = 'GABCDEF123456789STELLARADDRESS';
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  });

  it('uses custom copy aria-label for deposit address', () => {
    render(
      <CopyField
        label="Payment Address"
        value={address}
        copyAriaLabel="Copy deposit address"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Copy deposit address' }),
    ).toBeInTheDocument();
  });

  it('announces Copied via aria-live region after copy', async () => {
    const user = userEvent.setup();
    render(
      <CopyField
        label="Payment Address"
        value={address}
        copyAriaLabel="Copy deposit address"
        fieldId="deposit-address"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Copy deposit address' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Copied');
    });
  });

  it('exposes the full address value to assistive technologies', () => {
    render(
      <CopyField
        label="Payment Address"
        value={address}
        fieldId="deposit-address"
      />,
    );

    expect(screen.getByLabelText(`Payment Address: ${address}`)).toBeInTheDocument();
  });
});
