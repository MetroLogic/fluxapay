'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface CopyFieldProps {
  label: string;
  value: string;
  truncate?: boolean;
  required?: boolean;
  /** Overrides the default `Copy ${label}` aria-label on the copy button */
  copyAriaLabel?: string;
  /** Accessible id for the value element; auto-generated when omitted */
  fieldId?: string;
}

export function CopyField({
  label,
  value,
  truncate = false,
  required = false,
  copyAriaLabel,
  fieldId,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const valueId = fieldId ?? `copy-field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const buttonAriaLabel = copyAriaLabel ?? `Copy ${label}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
      toast.error('Failed to copy to clipboard');
    }
  };

  const displayValue = truncate && value.length > 20 
    ? `${value.slice(0, 10)}...${value.slice(-10)}` 
    : value;

  return (
    <div className="group relative mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span id={`${valueId}-label`} className="text-xs font-bold uppercase tracking-widest text-gray-500">
          {label}
        </span>
        {required && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-amber-700">
            Required
          </span>
        )}
      </div>
      <div className="relative flex items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-all hover:border-slate-400">
        <div
          id={valueId}
          className="flex-1 overflow-hidden px-4 py-3 font-mono text-sm text-gray-900"
          aria-labelledby={`${valueId}-label`}
          aria-label={`${label}: ${value}`}
        >
          <span className="block truncate" title={value}>
            {displayValue}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-full items-center justify-center border-l border-gray-200 px-4 py-3 text-gray-500 transition-colors hover:bg-slate-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--checkout-accent)]"
          aria-label={buttonAriaLabel}
          aria-describedby={copied ? `${valueId}-copied` : undefined}
        >
          {copied ? (
            <Check className="h-4 w-4 animate-in zoom-in" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="sr-only">{copied ? 'Copied' : buttonAriaLabel}</span>
        </button>
      </div>
      <span
        id={`${valueId}-copied`}
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {copied ? 'Copied' : ''}
      </span>
    </div>
  );
}
