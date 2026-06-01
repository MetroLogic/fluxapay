"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";

interface StellarPayButtonProps {
  address: string;
  amount: number;
  assetCode?: string;
  assetIssuer?: string;
  memo?: string;
  memoType?: string;
  className?: string;
}

/**
 * Generates a SEP-0007 `web+stellar:pay` URI and renders a deep-link button.
 * Compatible with Lobstr, StellarTerm, Solar, Freighter, and other SEP-0007 wallets.
 * @see https://github.com/AiBlocks/stellar-protocol/blob/master/ecosystem/sep-0007.md
 */
export function StellarPayButton({
  address,
  amount,
  assetCode = "USDC",
  assetIssuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  memo,
  memoType,
  className,
}: StellarPayButtonProps) {
  const sep7Uri = useMemo(() => {
    const params = new URLSearchParams();
    params.set("destination", address);
    params.set("amount", String(amount));

    // For native XLM, don't set asset_code/asset_issuer
    if (assetCode && assetCode !== "XLM") {
      params.set("asset_code", assetCode);
      if (assetIssuer) {
        params.set("asset_issuer", assetIssuer);
      }
    }

    if (memo) {
      params.set("memo", memo);
      if (memoType) {
        params.set("memo_type", memoType.replace("MEMO_", "").toUpperCase());
      }
    }

    return `web+stellar:pay?${params.toString()}`;
  }, [address, amount, assetCode, assetIssuer, memo, memoType]);

  return (
    <a
      href={sep7Uri}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--checkout-accent,#6366f1)] ${className ?? ""}`}
      style={{ backgroundColor: "var(--checkout-accent, #6366f1)" }}
      aria-label={`Pay ${amount} ${assetCode} with a Stellar wallet`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M12.283 1.5l.642.957c.252.377.557.724.907 1.023a7.858 7.858 0 004.044 1.848l1.124.159-.642-.957a5.92 5.92 0 00-.907-1.023A7.858 7.858 0 0013.407 1.66L12.283 1.5zm-8.152 4.22l18.587 8.044L21.47 16l-5.165-2.236a7.86 7.86 0 00-4.372-.71l-.39.06L2.87 8.87l1.261-3.15zm-.642 5.508L2.237 14.38l5.165 2.236a7.86 7.86 0 004.372.71l.39-.06 8.671 3.753-1.248 3.143L1 16.12l1.248-3.142 1.241 1.252z" />
      </svg>
      Pay with Wallet
      <ExternalLink className="h-4 w-4 opacity-70" />
    </a>
  );
}
