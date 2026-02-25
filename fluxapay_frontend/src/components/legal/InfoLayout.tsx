import React from "react";
import Header from "@/components/Header";
import { Footer } from "@/features/landing/sections/Footer";

export default function InfoLayout({ 
  title, 
  children 
}: { 
  title: string; 
  children: React.ReactNode 
}) {
  return (
    <div className="min-h-screen bg-[#0F0F1E] text-white">
      <Header />
      <main className="container mx-auto px-6 py-24 max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-12 bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
          {title}
        </h1>
        <div className="prose prose-invert prose-gray max-w-none prose-p:text-[#A0A0A0] prose-headings:text-white">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}