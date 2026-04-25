"use client";

import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import * as yup from "yup";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { api, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

const resetPasswordSchema = yup.object({
  password: yup.string().min(8, "Password must be at least 8 characters").required("Password is required"),
  confirmPassword: yup.string().oneOf([yup.ref('password')], 'Passwords must match').required("Please confirm your password"),
});

export const ResetPasswordForm = () => {
  const tAuth = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isValidatingToken, setIsValidatingToken] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");

  useEffect(() => {
    if (!token) {
      setTokenError(tAuth("missingResetToken"));
      setIsValidatingToken(false);
      return;
    }

    const validateToken = async () => {
      try {
        await api.auth.validateResetToken(token);
        setIsTokenValid(true);
      } catch (err) {
        if (err instanceof ApiError) {
          setTokenError(err.message);
        } else {
          setTokenError(tAuth("linkExpiredDescription"));
        }
      } finally {
        setIsValidatingToken(false);
      }
    };

    validateToken();
  }, [token, tAuth]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isTokenValid) return;

    try {
      await resetPasswordSchema.validate({ password, confirmPassword }, { abortEarly: false });
      setErrors({});
      setIsSubmitting(true);

      await api.auth.resetPassword({ token, new_password: password });
      
      toast.success("Password reset successfully! You can now log in.");
      router.push("/login");
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
        return;
      }
      if (err instanceof yup.ValidationError) {
        const fieldErrors: { password?: string; confirmPassword?: string } = {};
        err.inner.forEach((issue) => {
          if (issue.path && !fieldErrors[issue.path as "password" | "confirmPassword"]) {
            fieldErrors[issue.path as "password" | "confirmPassword"] = issue.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }
      toastApiError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidatingToken) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center space-y-4">
          <svg className="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <circle cx="12" cy="12" r="10" className="opacity-30" />
            <path d="M22 12a10 10 0 0 1-10 10" />
          </svg>
          <p className="text-muted-foreground font-medium">{tAuth("validatingLink")}</p>
        </div>
      </div>
    );
  }

  if (!isTokenValid) {
    return (
      <div className="min-h-screen w-full flex flex-col font-sans bg-slate-50 items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center space-y-6">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{tAuth("linkExpired")}</h1>
          <p className="text-slate-600">{tokenError || tAuth("linkExpiredDescription")}</p>
          <Button onClick={() => router.push("/forgot-password")} className="w-full">
            {tAuth("requestNewLink")}
          </Button>
          <div className="pt-2 text-center text-sm text-muted-foreground font-medium">
            <Link href="/login" className="text-indigo-500 hover:text-indigo-600 underline underline-offset-4">{tAuth("returnToSignIn")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white overflow-hidden flex flex-col font-sans">
      <div className="absolute top-6 left-2 md:left-10">
        <Image src="/assets/logo.svg" alt="FluxaPay Header" width={139} height={30} className="w-full h-auto" />
      </div>
      <div className="flex h-screen w-full items-stretch justify-between gap-0 px-3">
        <div className="flex h-full w-full md:w-[40%] items-center justify-center bg-transparent">
          <div className="w-full max-w-md rounded-none lg:rounded-r-2xl bg-white p-8 shadow-none animate-slide-in-left">
            <div className="space-y-2 mb-8 animate-fade-in [animation-delay:200ms]">
              <h1 className="text-2xl md:text-[40px] font-bold text-black tracking-tight">{tAuth("setNewPassword")}</h1>
              <p className="text-sm md:text-[18px] font-normal text-muted-foreground">
                {tAuth("setNewPasswordDescription")}
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5 animate-fade-in [animation-delay:200ms]">
              <div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    label={tAuth("newPassword")}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors(prev => ({ ...prev, password: "" }));
                    }}
                    placeholder={tAuth("newPasswordPlaceholder")}
                    error={errors.password}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-500 transition-colors"
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    label={tAuth("confirmPassword")}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: "" }));
                    }}
                    placeholder={tAuth("confirmNewPasswordPlaceholder")}
                    error={errors.confirmPassword}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-500 transition-colors"
                  >
                    {showConfirmPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                variant="brand"
                size="xl"
                className="w-full rounded-xl font-semibold"
              >
                {isSubmitting && (
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <circle cx="12" cy="12" r="10" className="opacity-30" />
                    <path d="M22 12a10 10 0 0 1-10 10" />
                  </svg>
                )}
                <span>{isSubmitting ? tAuth("updating") : tAuth("resetPassword")}</span>
              </Button>
            </form>
          </div>
        </div>
        <div className="hidden md:flex h-[98%] w-[60%] my-auto items-center justify-center rounded-2xl overflow-hidden bg-slate-900">
          <div className="relative h-full w-full">
            <Image src="/assets/login_form_container.svg" alt="Reset Password Form Container" fill className="object-cover object-top" />
          </div>
        </div>
      </div>
    </div>
  );
};
