import React from "react";
import { Logo } from "./Logo";

export function TopNav() {
  return (
    <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <Logo />
        <div className="text-xs text-slate-500">
          Enterprise-ready · Runs history · Exports · CI-friendly
        </div>
      </div>
    </div>
  );
}
