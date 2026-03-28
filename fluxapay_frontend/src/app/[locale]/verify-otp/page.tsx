"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";
import Image from "next/image";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { Link, useRouter as useI18nRouter } from "@/i18n/routing";
import { api, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

export default function VerifyOtpPage() {
  const tAuth = useTranslations("auth");
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
    async (e: React.FormEvent) => {
      e.preventDefault();

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
      <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-black">Invalid Request</h1>
          <p className="text-muted-foreground">
            Missing merchant ID. Please sign up first.
          </p>
          <Link
            href="/signup"
            className="inline-block text-indigo-500 hover:text-indigo-600 underline underline-offset-4"
          >
            Go to Sign Up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white overflow-hidden flex flex-col font-sans">
      <div className="absolute top-6 left-2 md:left-10">
        <Image
          src="/assets/logo.svg"
          alt="Logo"
          width={139}
          height={30}
          className="w-full h-auto"
        />
      </div>
      <div className="flex h-screen w-full items-center justify-center px-3">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg animate-slide-in-left">
          {/* Header */}
          <div className="space-y-2 mb-8 animate-fade-in [animation-delay:200ms]">
            <h1 className="text-2xl md:text-[40px] font-bold text-black tracking-tight">
              Verify Your Account
            </h1>
            <p className="text-sm md:text-[18px] font-normal text-muted-foreground">
              We've sent a 6-digit code to your {channel}.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleVerify}
            className="space-y-6 animate-fade-in [animation-delay:200ms]"
          >
            {/* OTP Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  setOtp(value);
                  if (error) setError("");
                }}
                placeholder="000000"
                className={`w-full h-14 text-center text-2xl font-mono tracking-[0.5em] rounded-xl border px-4 focus:ring-2 focus:ring-[#5649DF] focus:border-[#5649DF] ${
                  error ? "border-red-500" : "border-[#D9D9D9]"
                }`}
              />
              {error && (
                <p className="mt-2 text-sm text-red-500">{error}</p>
              )}
            </div>

            {/* Verify Button */}
            <Button
              type="submit"
              disabled={isVerifying || otp.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#5649DF] to-violet-500 px-6 py-3 text-sm md:text-[16px] font-semibold text-[#FFFFFF] shadow-md transition hover:shadow-lg hover:from-indigo-600 hover:to-violet-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isVerifying && (
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <circle cx="12" cy="12" r="10" className="opacity-30" />
                  <path d="M22 12a10 10 0 0 1-10 10" />
                </svg>
              )}
              <span>
                {isVerifying ? "Verifying..." : "Verify Account"}
              </span>
            </Button>

            {/* Resend OTP */}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Didn't receive the code?
              </p>
              {cooldown > 0 ? (
                <p className="text-sm text-slate-500">
                  Resend available in{" "}
                  <span className="font-semibold text-indigo-500">
                    {cooldown}s
                  </span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  className="text-sm font-semibold text-indigo-500 hover:text-indigo-600 underline underline-offset-4 disabled:opacity-50"
                >
                  {isResending ? "Resending..." : "Resend Code"}
                </button>
              )}
            </div>

            {/* Channel Toggle */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  const newChannel = channel === "email" ? "phone" : "email";
                  router.push(
                    `/verify-otp?merchantId=${merchantId}&channel=${newChannel}`,
                  );
                }}
                className="text-sm text-muted-foreground hover:text-slate-700 transition-colors"
              >
                Verify via {channel === "email" ? "phone" : "email"} instead
              </button>
            </div>

            {/* Back to Login */}
            <div className="pt-2 text-center text-xs md:text-[18px] text-muted-foreground font-semibold">
              Already verified?{" "}
              <Link
                href="/login"
                className="font-semibold text-indigo-500 hover:text-indigo-600 underline underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}