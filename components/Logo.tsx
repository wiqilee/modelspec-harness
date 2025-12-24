import React from "react";

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl2 border border-slate-200 bg-white shadow-soft flex items-center justify-center">
        <span className="text-indigo-600 font-black">MS</span>
      </div>
      <div>
        <div className="text-sm font-semibold leading-5">ModelSpec Harness</div>
        <div className="text-xs text-slate-500">Spec-driven compliance & cost harness</div>
      </div>
    </div>
  );
}
