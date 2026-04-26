"use client";

import React, { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
}

export const OtpInput = ({
  value,
  onChange,
  length = 6,
  disabled = false,
  error = false,
}: OtpInputProps) => {
  const [digits, setDigits] = useState<string[]>(new Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize digits from value prop
  useEffect(() => {
    if (value.length <= length) {
      const newDigits = new Array(length).fill("");
      for (let i = 0; i < value.length; i++) {
        newDigits[i] = value[i];
      }
      setDigits(newDigits);
    }
  }, [value, length]);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (isNaN(Number(val))) return;

    const newDigits = [...digits];
    // Take only the last character if multiple are pasted/entered
    newDigits[index] = val.substring(val.length - 1);
    setDigits(newDigits);

    const combined = newDigits.join("");
    onChange(combined);

    // Focus next input
    if (val && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, length);
    if (!/^\d+$/.test(pastedData)) return;

    const newDigits = new Array(length).fill("");
    for (let i = 0; i < pastedData.length; i++) {
      newDigits[i] = pastedData[i];
    }
    setDigits(newDigits);
    onChange(pastedData);

    // Focus the last input or the next empty one
    const focusIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  return (
    <div className="flex gap-2 justify-between">
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            "w-12 h-14 text-center text-2xl font-bold rounded-xl border transition-all duration-200",
            "focus:ring-2 focus:ring-[#5649DF] focus:border-[#5649DF] outline-none",
            error ? "border-red-500" : "border-[#D9D9D9]",
            disabled && "bg-slate-50 cursor-not-allowed opacity-50"
          )}
        />
      ))}
    </div>
  );
};
