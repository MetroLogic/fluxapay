"use client";

import React, { useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import toast from "react-hot-toast";

interface CopyButtonProps {
  /** Text placed on the clipboard. */
  value: string;
  /** Human-readable name of the value, used in toasts and the status region. */
  label: string;
  /** Accessible name for the button. Defaults to `Copy ${label}`. */
  ariaLabel?: string;
  /** Optional visible caption. When set, a check icon is shown after copying. */
  text?: string;
  /** Caption shown after a successful copy. Defaults to `Copied`. */
  copiedText?: string;
  /**
   * Disables copying and explains why on click. Use this instead of silently
   * copying a placeholder or a masked value that cannot be used.
   */
  disabled?: boolean;
  /** Message shown via toast.error when `disabled` is true. */
  disabledMessage?: string;
  className?: string;
  style?: React.CSSProperties;
}

const RESET_DELAY_MS = 2000;

/**
 * Copy-to-clipboard button with visible and screen-reader feedback.
 *
 * `navigator.clipboard.writeText` rejects when the document is not in a secure
 * context or the write permission is denied, so failures are reported rather
 * than swallowed — otherwise the button appears to do nothing.
 */
export function CopyButton({
  value,
  label,
  ariaLabel,
  text,
  copiedText = "Copied",
  disabled = false,
  disabledMessage,
  className,
  style,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonAriaLabel = ariaLabel ?? `Copy ${label}`;

  const handleCopy = async () => {
    if (disabled) {
      if (disabledMessage) toast.error(disabledMessage);
      return;
    }

    if (!value) {
      toast.error(`No ${label} to copy yet`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), RESET_DELAY_MS);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={buttonAriaLabel}
        className={className}
        style={style}
      >
        {copied ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
        {text ? (
          <span aria-hidden="true">{copied ? copiedText : text}</span>
        ) : (
          <span className="sr-only">{copied ? "Copied" : buttonAriaLabel}</span>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label} copied to clipboard` : ""}
      </span>
    </>
  );
}

export default CopyButton;
