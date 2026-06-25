"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";
import Image from "next/image";
import { Button } from "@/components/Button";
import { Link, useRouter as useI18nRouter } from "@/i18n/routing";
import { api, ApiError } from "@/lib/api";

import { OtpInput } from "@/components/OtpInput";

export default function VerifyOtpPage() {
  const router = useI18nRouter();
  const searchParams = useSearchParams();

  const merchantId = searchParams.get("merchantId") || "";
  const channel = (searchParams.get("channel") as "email" | "phone") || "email";

  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleVerify = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!merchantId) {
        setError("Missing merchant ID. Please sign up again.");
        return;
      }

      if (otp.length !== 6) {
        setError("Please enter a valid 6-digit OTP.");
        return;
      }

      setIsVerifying(true);
      setError("");

      try {
        await api.auth.verifyOtp({
          merchantId,
          channel,
          otp,
        });

        toast.success("Account verified successfully!");
        router.push("/login");
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          toastApiError(err);
        }
      } finally {
        setIsVerifying(false);
      }
    },
    [merchantId, channel, otp, router],
  );

  // Auto-verify when 6 digits are entered
  useEffect(() => {
    if (otp.length === 6) {
      handleVerify();
    }
  }, [otp, handleVerify]);

  const handleResend = useCallback(async () => {
    if (!merchantId) {
      setError("Missing merchant ID. Please sign up again.");
      return;
    }

    if (cooldown > 0) return;

    setIsResending(true);
    setError("");

    try {
      await api.auth.resendOtp({
        merchantId,
        channel,
      });

      toast.success(`OTP resent to your ${channel}!`);
      setCooldown(60); // 60 second cooldown
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        toastApiError(err);
      }
    } finally {
      setIsResending(false);
    }
  }, [merchantId, channel, cooldown]);

  if (!merchantId) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="text-center space-y-4 p-8 bg-white rounded-2xl shadow-sm max-w-sm">
          <h1 className="text-2xl font-bold text-slate-900">Invalid Request</h1>
          <p className="text-slate-500">
            Missing merchant ID. Please sign up first.
          </p>
          <Link
            href="/signup"
            className="inline-block px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
          >
            Go to Sign Up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col font-sans">
      <header className="p-6 md:px-10">
        <Image
          src="/assets/logo.svg"
          alt="FluxaPay"
          width={139}
          height={30}
          className="h-8 w-auto"
        />
      </header>
      
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[440px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 md:p-10 border border-slate-100">
            {/* Header */}
            <div className="space-y-3 mb-10">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                Verify your account
              </h1>
              <p className="text-slate-500 leading-relaxed">
                {"We've sent a 6-digit verification code to your "}
                <span className="font-semibold text-slate-900">{channel}</span>. 
                Please enter it below to activate your account.
              </p>
            </div>

            {/* Form */}
            <div className="space-y-8">
              {/* OTP Input */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700">
                  Verification Code
                </label>
                <OtpInput 
                  value={otp} 
                  onChange={setOtp} 
                  error={!!error}
                  disabled={isVerifying}
                />
                {error && (
                  <div className="flex items-center gap-2 text-red-500 animate-in fade-in slide-in-from-top-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}
              </div>

              {/* Verify Button */}
              <Button
                onClick={() => handleVerify()}
                disabled={isVerifying || otp.length !== 6}
                variant="brand"
                size="xl"
                className="w-full rounded-2xl h-14 text-lg font-bold shadow-lg shadow-indigo-200"
              >
                {isVerifying ? (
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10" className="opacity-30" />
                      <path d="M22 12a10 10 0 0 1-10 10" />
                    </svg>
                    <span>Verifying...</span>
                  </div>
                ) : (
                  "Verify Account"
                )}
              </Button>

              {/* Resend OTP */}
              <div className="text-center pt-2">
                <p className="text-slate-500 mb-2">
                  {"Didn't receive the code?"}
                </p>
                {cooldown > 0 ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full text-sm font-medium text-slate-600 border border-slate-100">
                    <svg className="h-4 w-4 text-indigo-500 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    Resend available in <span className="text-indigo-600">{cooldown}s</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="group text-indigo-600 font-bold hover:text-indigo-700 transition-all flex items-center gap-1 mx-auto"
                  >
                    <span>{isResending ? "Resending..." : "Resend Code"}</span>
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </button>
                )}
              </div>

              <div className="h-px bg-slate-100 w-full" />

              {/* Channel Toggle */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    const newChannel = channel === "email" ? "phone" : "email";
                    router.push(
                      `/verify-otp?merchantId=${merchantId}&channel=${newChannel}`,
                    );
                  }}
                  className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Verify via <span className="text-indigo-600">{channel === "email" ? "phone number" : "email address"}</span> instead
                </button>
              </div>
            </div>
          </div>

          {/* Footer links */}
          <div className="text-center space-x-6">
            <Link
              href="/login"
              className="text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
            >
              Back to login
            </Link>
            <Link
              href="/support"
              className="text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
            >
              Need help?
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}