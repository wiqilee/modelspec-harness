import "./globals.css";
import React from "react";

export const metadata = {
  title: "ModelSpec Harness",
  description: "Spec-driven, multi-model compliance harness for LLMs (Tinker-compatible).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased">
        <div className="relative min-h-screen bg-white">
          {/* Subtle “2026 white” depth (keeps it white, not flat) */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-gradient-to-b from-black/[0.02] via-transparent to-transparent" />
            <div className="absolute -top-64 left-1/2 h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-black/[0.035] blur-3xl" />
          </div>

          {children}
        </div>
      </body>
    </html>
  );
}
