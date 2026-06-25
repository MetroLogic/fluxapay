import { Suspense } from "react";
import { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Reset Password | FluxaPay",
    description: "Set a new password for your FluxaPay merchant account.",
    slug: "/reset-password",
    keywords: ["reset password", "merchant account", "fluxapay"],
    locale,
  });
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full flex items-center justify-center"><p>Loading...</p></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
