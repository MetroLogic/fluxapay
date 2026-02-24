"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import Image from "next/image";
import * as yup from "yup";
import Input from "@/components/Input";
import { Button } from "@/components/Button";

const signupSchema = yup.object({
  name: yup.string().required("Name is required"),
  businessName: yup.string().required("Business name is required"),
  email: yup
    .string()
    .email("Please enter a valid email address")
    .required("Email is required"),
  password: yup
    .string()
    .min(6, "Password must be at least 6 characters")
    .required("Password is required"),
});

type SignUpFormData = yup.InferType<typeof signupSchema>;

const SignUpForm = () => {
  const [formData, setFormData] = useState<SignUpFormData>({
    name: "",
    businessName: "",
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<{
    name?: string;
    businessName?: string;
    email?: string;
    password?: string;
  }>({});

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const validData = await signupSchema.validate(formData, {
        abortEarly: false,
      });

      setErrors({});
      setIsSubmitting(true);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      console.log("Signup data:", validData);
      toast.success("Signup successful!");
    } catch (err) {
      if (err instanceof yup.ValidationError) {
        const fieldErrors: {
          name?: string;
          businessName?: string;
          email?: string;
          password?: string;
        } = {};

        err.inner.forEach((issue) => {
          if (issue.path && !fieldErrors[issue.path as keyof SignUpFormData]) {
            fieldErrors[issue.path as keyof SignUpFormData] = issue.message;
          }
        });

        setErrors(fieldErrors);
        return;
      }

      toast.error("Unable to create your account right now. Please try again.");
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
        <div className="flex h-full w-full md:w-[40%] items-center justify-center bg-transparent ">
          <div className="w-full max-w-md rounded-none lg:rounded-r-2xl bg-white p-8 shadow-none animate-slide-in-left">
            {/* Form header */}
            <div className="space-y-2 mb-8 animate-fade-in [animation-delay:200ms]">
              <h1 className="text-2xl md:text-[40px] font-bold text-black tracking-tight">
                Get Started
              </h1>
              <p className="text-sm md:text-[18px] font-normal text-muted-foreground">
                Please signup to get started.
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="space-y-5 animate-fade-in [animation-delay:200ms]"
            >
              {/* Name */}
              <div>
                <Input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your name"
                  error={errors.name}
                />
              </div>

              {/* Business Name */}
              <div>
                <Input
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  placeholder="Business name"
                  error={errors.businessName}
                />
              </div>

              {/* Email */}
              <div>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  error={errors.email}
                />
              </div>

              {/* Password */}
              <div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Password"
                    error={errors.password}
                    className="pr-10 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
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
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#5649DF] to-violet-500 px-6 py-3 text-sm md:text-[16px] font-semibold text-[#FFFFFF] shadow-md transition hover:shadow-lg hover:from-indigo-600 hover:to-violet-600 disabled:cursor-not-allowed disabled:opacity-70"
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
                  {isSubmitting ? "Creating account..." : "Create account"}
                </span>
              </Button>

              {/* Have account */}
              <div className="pt-2 text-center text-xs md:text-[18px] text-muted-foreground font-semibold">
                Already have an account?{" "}
                <a
                  href="/login"
                  className="font-semibold text-indigo-500 hover:text-indigo-600 underline underline-offset-4 hover:underline"
                >
                  Sign in
                </a>
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
