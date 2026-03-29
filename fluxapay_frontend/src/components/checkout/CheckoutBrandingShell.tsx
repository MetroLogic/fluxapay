'use client';

import { useState } from 'react';

const DEFAULT_ACCENT = '#2563eb';

export interface CheckoutBrandingShellProps {
  /** Normalized #rrggbb */
  accentHex?: string;
  logoUrl?: string | null;
  merchantName?: string | null;
  /** Show top bar with logo / name when payment context exists */
  showBrandHeader?: boolean;
  children: React.ReactNode;
}

function CheckoutBrandMark({
  logoUrl,
  merchantName,
  accentHex,
}: {
  logoUrl?: string | null;
  merchantName?: string | null;
  accentHex: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const initial = (merchantName?.trim()?.charAt(0) || 'P').toUpperCase();

  if (logoUrl && !logoFailed) {
    return (
      <div className="relative h-10 w-auto max-w-[200px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote merchant URLs */}
        <img
          src={logoUrl}
          alt=""
          className="h-10 w-auto max-w-[200px] object-contain object-left"
          onError={() => setLogoFailed(true)}
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
      style={{ backgroundColor: accentHex }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

/**
 * Hosted checkout wrapper: CSS variables for accent + optional merchant header.
 * Logo falls back to monogram when the image fails to load.
 */
export function CheckoutBrandingShell({
  accentHex = DEFAULT_ACCENT,
  logoUrl,
  merchantName,
  showBrandHeader = false,
  children,
}: CheckoutBrandingShellProps) {
  const accent = accentHex.startsWith('#') ? accentHex : `#${accentHex}`;

  const shellStyle = {
    '--checkout-accent': accent,
    '--checkout-tint1': `color-mix(in srgb, ${accent} 16%, white)`,
    '--checkout-tint2': `color-mix(in srgb, ${accent} 9%, #e5e7eb)`,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-br from-[var(--checkout-tint1)] to-[var(--checkout-tint2)]"
      style={shellStyle}
    >
      {showBrandHeader && (
        <header className="flex justify-center border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl items-center justify-center gap-3">
            <CheckoutBrandMark
              logoUrl={logoUrl}
              merchantName={merchantName}
              accentHex={accent}
            />
            {merchantName ? (
              <span className="truncate text-center text-sm font-semibold text-gray-900">
                {merchantName}
              </span>
            ) : null}
          </div>
        </header>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

export { DEFAULT_ACCENT };
