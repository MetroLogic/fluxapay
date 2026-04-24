import { Metadata } from "next";
import { SignUpForm } from "@/features/auth";
import { generatePageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    title: "Create a FluxaPay Account - Start Accepting Payments",
    description: "Sign up for FluxaPay and start accepting crypto and fiat payments globally. Free to get started.",
    slug: "/signup",
    keywords: ["sign up", "register", "create account", "merchant account", "payment platform"],
    locale,
  });
}

export default function LocalizedSignUpPage() {
  return <SignUpForm />;
}
