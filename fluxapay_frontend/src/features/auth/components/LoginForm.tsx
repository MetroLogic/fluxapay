"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/routing";
import * as yup from "yup";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { api, ApiError, storeToken } from "@/lib/api";
import { useTranslations } from "next-intl";

const loginSchema = (t: any) => yup.object({
  email: yup.string().email(t("validation.emailInvalid")).required(t("validation.emailRequired")),
  password: yup.string().min(6, t("validation.passwordMin")).required(t("validation.passwordRequired")),
  keepLoggedIn: yup.boolean(),
});

type LoginFormData = yup.InferType<typeof loginSchema>;

const LoginForm = () => {
  const router = useRouter();
  const tAuth = useTranslations("auth");
  const [formData, setFormData] = useState<LoginFormData>({ email: "", password: "", keepLoggedIn: false });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === "checkbox" ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: newValue }));
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const validData = await loginSchema(tAuth).validate(formData, { abortEarly: false });
      setErrors({});
      setIsSubmitting(true);

      const data = (await api.auth.login({
        email: validData.email,
        password: validData.password,
      })) as { token?: string; message?: string };

      if (!data.token) {
        throw new Error("Login response missing token");
      }

      storeToken(data.token, Boolean(validData.keepLoggedIn));
      toast.success(data.message || tAuth("signupSuccess")); // Assuming signupSuccess for now or just generic
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
        return;
      }
      if (err instanceof yup.ValidationError) {
        const fieldErrors: { email?: string; password?: string } = {};
        err.inner.forEach((issue) => {
          if (issue.path && !fieldErrors[issue.path as "email" | "password"]) {
            fieldErrors[issue.path as "email" | "password"] = issue.message;
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

  return (
    <div className="min-h-screen w-full bg-white overflow-hidden flex flex-col font-sans">
      <div className="absolute top-6 left-2 md:left-10">
        <Image src="/assets/logo.svg" alt="Login Header" width={139} height={30} className="w-full h-auto" />
      </div>
      <div className="flex h-screen w-full items-stretch justify-between gap-0 px-3">
        <div className="flex h-full w-full md:w-[40%] items-center justify-center bg-transparent">
          <div className="w-full max-w-md rounded-none lg:rounded-r-2xl bg-white p-8 shadow-none animate-slide-in-left">
            <div className="space-y-2 mb-8 animate-fade-in [animation-delay:200ms]">
              <h1 className="text-2xl md:text-[40px] font-bold text-black tracking-tight">{tAuth("login")}</h1>
              <p className="text-sm md:text-[18px] font-normal text-muted-foreground">{tAuth("loginToContinue")}</p>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              aria-label="Login form"
              noValidate
              className="space-y-5 animate-fade-in [animation-delay:200ms]"
            >
              {/* Email */}
              <div>
                <Input
                  type="email"
                  name="email"
                  label={tAuth("email")}
                  value={formData.email}
                  onChange={handleChange}
                  placeholder={tAuth("emailPlaceholder")}
                  error={errors.email}
                />
              </div>

              {/* Password */}
              <div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    label={tAuth("password")}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={tAuth("passwordPlaceholder")}
                    error={errors.password}
                    className="pr-10 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Hide concealed characters" : "Show concealed characters"
                    }
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-500 transition-colors"
                  >
                    {showPassword ? (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Keep me logged in */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600">
                    <input
                      type="checkbox"
                      name="keepLoggedIn"
                      checked={formData.keepLoggedIn}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-black font-medium text-[16px]">
                      {tAuth("keepLoggedIn")}
                    </span>
                  </label>
                </div>
                <p className="text-xs text-slate-500 pl-6">
                  {formData.keepLoggedIn
                    ? tAuth("sessionPersistent")
                    : tAuth("sessionExpiry")}
                </p>
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                disabled={isSubmitting}
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
                <span>{isSubmitting ? tAuth("signingIn") : tAuth("login")}</span>
              </Button>

              <p className="mt-4 text-center text-xs text-slate-500">
                {tAuth("agreeToTerms")}{" "}
                <Link
                  href="/terms"
                  className="font-medium text-slate-700 hover:text-indigo-600 underline underline-offset-4"
                >
                  {tAuth("terms")}
                </Link>{" "}
                {tAuth("and")}{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-slate-700 hover:text-indigo-600 underline underline-offset-4"
                >
                  {tAuth("privacy")}
                </Link>
                .
              </p>

              {/* Create account */}
              <div className="pt-2 text-center text-xs md:text-[18px] text-muted-foreground font-semibold">
                {tAuth("needAccount")}{" "}
                <Link href="/signup" className="font-semibold text-indigo-500 hover:text-indigo-600 underline underline-offset-4">{tAuth("createOne")}</Link>
              </div>
            </form>
          </div>
        </div>
        <div className="hidden md:flex h-[98%] w-[60%] my-auto items-center justify-center rounded-2xl overflow-hidden bg-slate-900">
          <div className="relative h-full w-full">
            <Image src="/assets/login_form_container.svg" alt="Login Form Container" fill className="object-cover object-top" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
