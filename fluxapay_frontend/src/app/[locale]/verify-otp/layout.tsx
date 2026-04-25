import { Metadata } from "next";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    title: "Verify Your Account | FluxaPay",
    description: "Enter the verification code sent to your email or phone to activate your FluxaPay account.",
    slug: "/verify-otp",
    keywords: ["verify account", "OTP", "verification code", "account activation"],
    locale,
  });
}

export default function VerifyOtpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
