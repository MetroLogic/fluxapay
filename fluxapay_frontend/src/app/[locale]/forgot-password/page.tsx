import { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Forgot Password | FluxaPay",
    description: "Reset your FluxaPay merchant account password.",
    slug: "/forgot-password",
    keywords: ["forgot password", "reset password", "merchant account", "fluxapay"],
    locale,
  });
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
