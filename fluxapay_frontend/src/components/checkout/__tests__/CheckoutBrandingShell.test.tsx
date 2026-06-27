import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckoutBrandingShell, DEFAULT_ACCENT } from '../CheckoutBrandingShell';

describe('CheckoutBrandingShell', () => {
  it('renders custom merchant logo, business name, and checkout accent CSS variable', () => {
    const { container } = render(
      <CheckoutBrandingShell
        accentHex="#ff5500"
        logoUrl="https://cdn.example.com/acme.png"
        merchantName="Acme Store"
        showBrandHeader
      >
        <button className="bg-[var(--checkout-accent)]">Pay now</button>
      </CheckoutBrandingShell>
    );

    expect(screen.getByRole('img', { name: 'Acme Store logo' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/acme.png'
    );
    expect(screen.getByText('Acme Store')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ '--checkout-accent': '#ff5500' });
  });

  it('falls back to FluxaPay default accent when merchant branding is absent', () => {
    const { container } = render(
      <CheckoutBrandingShell showBrandHeader>
        <p>Checkout</p>
      </CheckoutBrandingShell>
    );

    expect(container.firstElementChild).toHaveStyle({ '--checkout-accent': DEFAULT_ACCENT });
    expect(screen.getByText('P')).toBeInTheDocument();
  });
});
