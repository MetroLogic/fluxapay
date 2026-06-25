'use client';

import { ExternalLink, Copy } from 'lucide-react';
import { getStellarExpertTxUrl, shouldOpenInNewTab } from '@/lib/stellar';

interface TxHashLinkProps {
  /** Full transaction hash from the Stellar network. */
  txHash: string;
  /**
   * Optional pre-computed Stellar Expert URL.
   * When provided, this takes precedence over the auto-generated URL.
   */
  stellarExpertUrl?: string;
  /**
   * How many leading characters of the hash to show.
   * @default 8
   */
  truncateStart?: number;
  /**
   * How many trailing characters of the hash to show.
   * @default 4
   */
  truncateEnd?: number;
  /** Additional CSS classes on the wrapper. */
  className?: string;
  /** Whether to show a copy-to-clipboard button. @default false */
  showCopy?: boolean;
  /** Label rendered above the link (e.g. "Transaction Hash"). */
  label?: string;
}

/**
 * Renders a truncated transaction hash that links to Stellar Expert.
 *
 * - Network (testnet vs public) is driven by `NEXT_PUBLIC_STELLAR_NETWORK`.
 * - New-tab behaviour is driven by `NEXT_PUBLIC_STELLAR_EXPLORER_NEW_TAB`.
 */
export function TxHashLink({
  txHash,
  stellarExpertUrl,
  truncateStart = 8,
  truncateEnd = 4,
  className = '',
  showCopy = false,
  label,
}: TxHashLinkProps) {
  const href = stellarExpertUrl || getStellarExpertTxUrl(txHash);
  const openInNewTab = shouldOpenInNewTab();

  const displayed =
    txHash.length > truncateStart + truncateEnd + 3
      ? `${txHash.slice(0, truncateStart)}…${txHash.slice(-truncateEnd)}`
      : txHash;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(txHash);
    } catch {
      // Silently ignore – clipboard may not be available in some contexts
    }
  };

  return (
    <div className={className}>
      {label && (
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
      )}
      <span className="inline-flex items-center gap-1.5">
        <a
          href={href}
          target={openInNewTab ? '_blank' : '_self'}
          rel={openInNewTab ? 'noopener noreferrer' : undefined}
          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline transition-colors"
          title={`View transaction on Stellar Expert: ${txHash}`}
        >
          {displayed}
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Copy transaction hash"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}
