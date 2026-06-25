'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Wallet, ExternalLink } from 'lucide-react';

const HORIZON_BASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'public'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
const STELLAR_NETWORK =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'public' ? 'PUBLIC' : 'TESTNET';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// --- Freighter type shim ---
declare global {
  interface Window {
    freighterApi?: {
      isConnected(): Promise<{ isConnected: boolean }>;
      getPublicKey(): Promise<string>;
      signTransaction(
        xdr: string,
        opts: { network?: string; networkPassphrase?: string }
      ): Promise<{ signedTxXdr: string } | string>;
    };
    albedo?: {
      pay(params: {
        destination: string;
        amount: string;
        asset_code?: string;
        asset_issuer?: string;
        memo?: string;
        memo_type?: string;
        network?: string;
      }): Promise<{ tx_hash: string; signed_envelope_xdr: string }>;
    };
  }
}

export interface BrowserWalletButtonsProps {
  address: string;
  amount: number;
  assetCode?: string;
  assetIssuer?: string;
  memo?: string;
  memoType?: string;
  paymentId?: string;
  onPaymentConfirmed?: (txHash: string) => void;
}

type WalletState = 'detecting' | 'ready' | 'signing' | 'submitting' | 'success' | 'error';

export function BrowserWalletButtons({
  address,
  amount,
  assetCode = 'USDC',
  assetIssuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  memo,
  memoType,
  paymentId,
  onPaymentConfirmed,
}: BrowserWalletButtonsProps) {
  const [freighterAvailable, setFreighterAvailable] = useState(false);
  const [albedoAvailable, setAlbedoAvailable] = useState(false);
  const [state, setState] = useState<WalletState>('detecting');
  const [statusMsg, setStatusMsg] = useState('');
  const [txHash, setTxHash] = useState('');

  // Detect wallets on mount
  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      // Freighter: check window.freighterApi
      const hasFreighter =
        typeof window !== 'undefined' && typeof window.freighterApi !== 'undefined';
      if (hasFreighter) {
        try {
          const { isConnected } = await window.freighterApi!.isConnected();
          if (!cancelled) setFreighterAvailable(isConnected);
        } catch {
          if (!cancelled) setFreighterAvailable(true); // API exists, assume available
        }
      }

      // Albedo: load script if not already present
      if (typeof window !== 'undefined' && typeof window.albedo === 'undefined') {
        await new Promise<void>((resolve) => {
          const existing = document.querySelector('script[src*="albedo.link"]');
          if (existing) { resolve(); return; }
          const script = document.createElement('script');
          script.src = 'https://albedo.link/serve.js';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => resolve(); // fail silently
          document.head.appendChild(script);
        });
      }

      // Give albedo a moment to initialise
      await new Promise((r) => setTimeout(r, 300));
      if (!cancelled) setAlbedoAvailable(typeof window.albedo !== 'undefined');
      if (!cancelled) setState('ready');
    };

    void detect();
    return () => { cancelled = true; };
  }, []);

  const submitToHorizon = useCallback(async (signedXdr: string): Promise<string> => {
    const body = new URLSearchParams({ tx: signedXdr });
    const res = await fetch(`${HORIZON_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = await res.json() as { hash?: string; extras?: { result_codes?: unknown } };
    if (!res.ok) throw new Error(`Horizon error: ${JSON.stringify(json.extras?.result_codes ?? json)}`);
    return json.hash ?? '';
  }, []);

  const handleFreighter = useCallback(async () => {
    if (!window.freighterApi) return;
    setState('signing');
    setStatusMsg('Requesting public key from Freighter…');
    try {
      const publicKey = await window.freighterApi.getPublicKey();
      setStatusMsg('Building transaction…');

      // Ask backend to build the transaction XDR
      const buildRes = await fetch(
        `${API_BASE}/api/v1/payments/${paymentId}/build-transaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceAccount: publicKey }),
        }
      );

      if (!buildRes.ok) {
        // Graceful fallback: transaction building not supported yet
        setStatusMsg(
          `Wallet connected (${publicKey.slice(0, 6)}…${publicKey.slice(-4)}). ` +
          `Please send ${amount} ${assetCode} to the payment address shown above. ` +
          `Transaction builder not yet available on this endpoint.`
        );
        setState('ready');
        return;
      }

      const buildData = await buildRes.json() as { xdr?: string };
      if (!buildData.xdr) throw new Error('No XDR returned from build endpoint');

      setStatusMsg('Please sign the transaction in Freighter…');
      const signResult = await window.freighterApi.signTransaction(buildData.xdr, {
        network: STELLAR_NETWORK,
      });
      const signedXdr = typeof signResult === 'string' ? signResult : signResult.signedTxXdr;

      setState('submitting');
      setStatusMsg('Submitting to Stellar network…');
      const hash = await submitToHorizon(signedXdr);
      setTxHash(hash);
      setState('success');
      setStatusMsg('Payment submitted successfully!');
      onPaymentConfirmed?.(hash);
    } catch (err) {
      setState('error');
      setStatusMsg(err instanceof Error ? err.message : 'Freighter payment failed');
    }
  }, [paymentId, amount, assetCode, submitToHorizon, onPaymentConfirmed]);

  const handleAlbedo = useCallback(async () => {
    if (!window.albedo) return;
    setState('signing');
    setStatusMsg('Opening Albedo…');
    try {
      const result = await window.albedo.pay({
        destination: address,
        amount: String(amount),
        asset_code: assetCode !== 'XLM' ? assetCode : undefined,
        asset_issuer: assetCode !== 'XLM' ? assetIssuer : undefined,
        memo: memo || undefined,
        memo_type: memoType ? memoType.replace('MEMO_', '').toLowerCase() : undefined,
        network: STELLAR_NETWORK,
      });
      setTxHash(result.tx_hash);
      setState('success');
      setStatusMsg('Payment confirmed via Albedo!');
      onPaymentConfirmed?.(result.tx_hash);
    } catch (err) {
      setState('error');
      setStatusMsg(err instanceof Error ? err.message : 'Albedo payment cancelled or failed');
    }
  }, [address, amount, assetCode, assetIssuer, memo, memoType, onPaymentConfirmed]);

  if (state === 'detecting') {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Detecting browser wallets…
      </div>
    );
  }

  if (!freighterAvailable && !albedoAvailable) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500 space-y-2">
        <p className="font-medium">No browser wallet detected</p>
        <div className="flex items-center justify-center gap-4">
          <a
            href="https://www.freighter.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            Install Freighter <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://albedo.link/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            Use Albedo <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center space-y-1">
        <p className="text-sm font-semibold text-green-800">{statusMsg}</p>
        {txHash && (
          <a
            href={`${HORIZON_BASE.replace('https://horizon', 'https://stellar.expert/explorer')}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-green-700 font-mono hover:underline"
          >
            {txHash.slice(0, 12)}…{txHash.slice(-6)}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  const busy = state === 'signing' || state === 'submitting';

  return (
    <div className="space-y-3">
      {statusMsg && (
        <p
          className={`text-xs text-center rounded-md px-3 py-2 ${state === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}
          role="status"
          aria-live="polite"
        >
          {statusMsg}
        </p>
      )}

      <p className="text-xs text-center text-gray-500 font-medium uppercase tracking-wider">
        Pay with browser wallet
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {freighterAvailable && (
          <button
            onClick={handleFreighter}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#5e6cf8] bg-[#5e6cf8]/10 px-5 py-2.5 text-sm font-semibold text-[#5e6cf8] transition-all hover:bg-[#5e6cf8]/20 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5e6cf8]"
            aria-label="Pay with Freighter extension"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Pay with Freighter
          </button>
        )}

        {albedoAvailable && (
          <button
            onClick={handleAlbedo}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#e8832a] bg-[#e8832a]/10 px-5 py-2.5 text-sm font-semibold text-[#e8832a] transition-all hover:bg-[#e8832a]/20 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8832a]"
            aria-label="Pay with Albedo web wallet"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Pay with Albedo
          </button>
        )}
      </div>
    </div>
  );
}
