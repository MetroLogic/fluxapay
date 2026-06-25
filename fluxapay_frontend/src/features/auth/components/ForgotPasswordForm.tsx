"use client";

import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";
import Image from "next/image";
import { Link } from "@/i18n/routing";
import * as yup from "yup";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { api, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

const forgotPasswordSchema = yup.object({
  email: yup.string().email("Please enter a valid email address").required("Email is required"),
});

export const ForgotPasswordForm = () => {
  const tAuth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (cooldown > 0) return;

    try {
      await forgotPasswordSchema.validate({ email });
      setError("");
      setIsSubmitting(true);

      await api.auth.forgotPassword({ email });
      
      setIsSuccess(true);
      setCooldown(60);
      toast.success("Password reset link sent! Please check your email.");
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
        return;
      }
      if (err instanceof yup.ValidationError) {
        setError(err.message);
        return;
      }
      toastApiError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white overflow-hidden flex flex-col font-sans">
      <div className="absolute top-6 left-2 md:left-10">
        <Image src="/assets/logo.svg" alt="FluxaPay Header" width={139} height={30} className="w-full h-auto" />
      </div>
      <div className="flex h-screen w-full items-stretch justify-between gap-0 px-3">
        <div className="flex h-full w-full md:w-[40%] items-center justify-center bg-transparent">
          <div className="w-full max-w-md rounded-none lg:rounded-r-2xl bg-white p-8 shadow-none animate-slide-in-left">
            <div className="space-y-2 mb-8 animate-fade-in [animation-delay:200ms]">
              <h1 className="text-2xl md:text-[40px] font-bold text-black tracking-tight">{tAuth("resetPassword")}</h1>
              <p className="text-sm md:text-[18px] font-normal text-muted-foreground">
                {isSuccess 
                  ? tAuth("resetLinkSent")
                  : tAuth("forgotPasswordDescription")}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              aria-label="Forgot password form"
              noValidate
              className="space-y-5 animate-fade-in [animation-delay:200ms]"
            >
              <div>
                <Input
                  type="email"
                  name="email"
                  label={tAuth("email")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder={tAuth("emailPlaceholder")}
                  error={error}
                  disabled={isSubmitting || cooldown > 0}
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || cooldown > 0}
                variant="brand"
                size="xl"
                className="w-full rounded-xl font-semibold"
              >
                {isSubmitting && (
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
                  {isSubmitting 
                    ? tAuth("sending") 
                    : cooldown > 0 
                      ? tAuth("sendAgainIn", { seconds: cooldown }) 
                      : tAuth("sendResetLink")}
                </span>
              </Button>

              <div className="pt-4 text-center text-xs md:text-[16px] text-muted-foreground font-semibold">
                {tAuth("rememberPassword")}{" "}
                <Link href="/login" className="font-semibold text-indigo-500 hover:text-indigo-600 underline underline-offset-4">{tAuth("login")}</Link>
              </div>
            </form>
          </div>
        </div>
        <div className="hidden md:flex h-[98%] w-[60%] my-auto items-center justify-center rounded-2xl overflow-hidden bg-slate-900">
          <div className="relative h-full w-full">
            <Image src="/assets/login_form_container.svg" alt="Forgot Password Form Container" fill className="object-cover object-top" />
          </div>
        </div>
      </div>
    </div>
  );
};
