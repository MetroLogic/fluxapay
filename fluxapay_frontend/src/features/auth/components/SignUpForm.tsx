"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import { toastApiError } from "@/lib/toastApiError";
import Image from "next/image";
import * as yup from "yup";
import Input from "@/components/Input";
import { Button } from "@/components/Button";
import { Link, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NG, KE } from "country-flag-icons/react/3x2";
import { useTranslations } from "next-intl";

const COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN", Icon: NG },
  { code: "KE", name: "Kenya", currency: "KES", Icon: KE },
];

const signupSchema = yup.object({
  business_name: yup.string().required("Business name is required"),
  email: yup
    .string()
    .email("Please enter a valid email address")
    .required("Email is required"),
  phone_number: yup.string().required("Phone number is required"),
  password: yup
    .string()
    .min(6, "Password must be at least 6 characters")
    .required("Password is required"),
  country: yup.string().required("Country is required"),
  settlement_currency: yup.string().required("Settlement currency is required"),
  account_name: yup.string().optional(),
  account_number: yup.string().optional(),
  bank_name: yup.string().optional(),
  bank_code: yup.string().optional(),
});

type SignUpFormData = yup.InferType<typeof signupSchema>;

const SignUpForm = () => {
  const router = useRouter();
  const tAuth = useTranslations("auth");
  const [formData, setFormData] = useState<SignUpFormData>({
    business_name: "",
    email: "",
    phone_number: "",
    password: "",
    country: "",
    settlement_currency: "",
    account_name: "",
    account_number: "",
    bank_name: "",
    bank_code: "",
  });

  const [errors, setErrors] = useState<{
    business_name?: string;
    email?: string;
    phone_number?: string;
    password?: string;
    country?: string;
    settlement_currency?: string;
    account_name?: string;
    account_number?: string;
    bank_name?: string;
    bank_code?: string;
  }>({});

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleCountryChange = (value: string) => {
    const selectedCountry = COUNTRIES.find((c) => c.code === value);
    setFormData((prev) => ({
      ...prev,
      country: value,
      settlement_currency: selectedCountry?.currency || "",
    }));
    setErrors((prev) => ({ ...prev, country: "", settlement_currency: "" }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const validData = await signupSchema.validate(formData, { abortEarly: false });

      setErrors({});
      setIsSubmitting(true);

      const response = await api.auth.signup(validData as any);

      toast.success("Signup successful! Please verify your account.");
      
      if (response.merchantId) {
        router.push(
          `/verify-otp?merchantId=${response.merchantId}&channel=email`,
        );
      }
    } catch (err) {
      if (err instanceof yup.ValidationError) {
        const fieldErrors: any = {};
        err.inner.forEach((issue) => {
          if (issue.path) {
            fieldErrors[issue.path] = issue.message;
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
        <Image
          src="/assets/logo.svg"
          alt="Signup Header"
          width={139}
          height={30}
          className="w-full h-auto"
        />
      </div>
      <div className="flex h-screen w-full items-stretch justify-between gap-0 px-3">
        {/* Card: 40% width */}
        <div className="flex h-full w-full md:w-[40%] items-center justify-center bg-transparent">
          <div className="w-full max-md:max-w-md rounded-none lg:rounded-r-2xl bg-white p-8 shadow-none animate-slide-in-left">
            {/* Form header */}
            <div className="space-y-2 mb-8 animate-fade-in [animation-delay:200ms]">
              <h1 className="text-2xl md:text-[40px] font-bold text-black tracking-tight">
                {tAuth("signup")}
              </h1>
              <p className="text-sm md:text-[18px] font-normal text-muted-foreground">
                Please signup to get started.
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              aria-label="Sign up form"
              noValidate
              className="space-y-5 animate-fade-in [animation-delay:200ms]"
            >
              {/* Business Name */}
              <div>
                <Input
                  type="text"
                  name="business_name"
                  label={tAuth("businessName")}
                  value={formData.business_name}
                  onChange={handleChange}
                  placeholder="Business name"
                  error={errors.business_name}
                />
              </div>

              {/* Email */}
              <div>
                <Input
                  type="email"
                  name="email"
                  label={tAuth("email")}
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  error={errors.email}
                />
              </div>

              {/* Phone Number */}
              <div>
                <Input
                  type="tel"
                  name="phone_number"
                  label="Phone Number"
                  value={formData.phone_number}
                  onChange={handleChange}
                  placeholder="+234..."
                  error={errors.phone_number}
                />
              </div>

              {/* Country & Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label id="country-label" className="block text-sm font-medium text-slate-700">
                    {tAuth("country")}
                  </label>
                  <Select value={formData.country} onValueChange={handleCountryChange}>
                    <SelectTrigger
                      aria-labelledby="country-label"
                      aria-describedby={errors.country ? "country-error" : undefined}
                      aria-invalid={errors.country ? "true" : undefined}
                      className={cn(
                        "w-full h-[46px] rounded-[10px] border px-4 text-sm bg-white focus:ring-2 focus:ring-[#5649DF] focus:border-[#5649DF]",
                        errors.country ? "border-red-500" : "border-[#D9D9D9]",
                      )}
                    >
                      <SelectValue placeholder="Select Country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          <div className="flex items-center gap-2">
                            <country.Icon className="w-4 h-3" aria-hidden="true" />
                            <span>{country.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.country && (
                    <span id="country-error" role="alert" className="text-xs text-red-500">{errors.country}</span>
                  )}
                </div>

                <div className="space-y-2">
                  <Input
                    type="text"
                    name="settlement_currency"
                    label="Currency"
                    value={formData.settlement_currency}
                    readOnly
                    placeholder="Currency"
                    error={errors.settlement_currency}
                    className="bg-slate-50 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Bank Details */}
              <div className="space-y-4">
                <Input
                  type="text"
                  name="account_name"
                  label="Account Holder Name"
                  value={formData.account_name}
                  onChange={handleChange}
                  placeholder="Full name on bank account"
                  error={errors.account_name}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    type="text"
                    name="bank_name"
                    label="Bank"
                    value={formData.bank_name}
                    onChange={handleChange}
                    placeholder="Bank Name"
                    error={errors.bank_name}
                  />
                  <Input
                    type="text"
                    name="bank_code"
                    label="Code"
                    value={formData.bank_code}
                    onChange={handleChange}
                    placeholder="Bank Code"
                    error={errors.bank_code}
                  />
                  <Input
                    type="text"
                    name="account_number"
                    label="Account"
                    value={formData.account_number}
                    onChange={handleChange}
                    placeholder="Account Number"
                    error={errors.account_number}
                  />
                </div>
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
                    placeholder="Password"
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

              {/* Submit button */}
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
                <span>{isSubmitting ? "Creating account..." : "Create account"}</span>
              </Button>
              <p className="mt-4 text-center text-xs text-slate-500">
                By creating an account, you agree to our{" "}
                <Link
                  href="/terms"
                  className="font-medium text-slate-700 hover:text-indigo-600 underline underline-offset-4"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-slate-700 hover:text-indigo-600 underline underline-offset-4"
                >
                  Privacy Policy
                </Link>
                .
              </p>

              {/* Have account */}
              <div className="pt-2 text-center text-xs md:text-[18px] text-muted-foreground font-semibold">
                Already have an account?{" "}
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

        {/* Side image: 60% width, full height */}
        <div className="hidden md:flex h-[98%] w-[60%] my-auto items-center justify-center rounded-2xl overflow-hidden bg-slate-900">
          <div className="relative h-full w-full">
            <Image
              src="/assets/login_form_container.svg"
              alt="Signup Form Container"
              fill
              className="object-cover object-top"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUpForm;
