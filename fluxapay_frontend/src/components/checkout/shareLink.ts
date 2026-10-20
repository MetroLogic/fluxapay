export interface ShareLinkInput {
  title: string;
  amount: number | string;
  currency: string;
  url: string;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export function vibrateOnCopy(ms = 50): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch {
    /* haptics are best effort */
  }
}

/** Shares via the native sheet when available, otherwise copies the URL to the clipboard. */
export async function shareOrCopyLink(input: ShareLinkInput): Promise<ShareResult> {
  const text = `${input.title} - ${input.amount} ${input.currency}`;
  if (canUseWebShare()) {
    try {
      await navigator.share({ title: input.title, text, url: input.url });
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(input.url);
    vibrateOnCopy();
    return 'copied';
  } catch {
    return 'failed';
  }
}
