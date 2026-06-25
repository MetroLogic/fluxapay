import { Metadata } from "next";
import { LoginForm } from "@/features/auth";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  
  return generatePageMetadata({
    title: "Login to Your FluxaPay Account",
    description: "Sign in to your FluxaPay merchant dashboard to manage payments, view analytics, and configure your payment settings.",
    slug: "/login",
    keywords: ["login", "sign in", "merchant account", "payment dashboard"],
    locale,
  });
}

export default function LocalizedLoginPage() {
  return <LoginForm />;
}
