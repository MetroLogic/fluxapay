'use client';

import React, { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { canUseWebShare, shareOrCopyLink, type ShareLinkInput } from './shareLink';

/** "Share Link" action; uses the native share sheet when supported, clipboard otherwise. */
export function ShareLinkButton(props: ShareLinkInput) {
  const [done, setDone] = useState(false);
  const [supported] = useState(() => canUseWebShare());

  const onClick = async () => {
    const result = await shareOrCopyLink(props);
    if (result === 'copied') toast.success('Payment link copied to clipboard');
    if (result === 'failed') toast.error('Unable to share or copy the link');
    if (result === 'shared' || result === 'copied') {
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-web-share={supported ? 'native' : 'fallback'}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-slate-900 hover:text-white active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--checkout-accent)]"
    >
      {done ? (
        <Check className="h-4 w-4 animate-in zoom-in" aria-hidden="true" />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{supported ? 'Share Link' : 'Copy Link'}</span>
    </button>
  );
}
