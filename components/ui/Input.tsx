import React from "react";

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={
        "w-full rounded-xl2 border border-slate-200 bg-white px-3 py-2 text-sm " +
        "shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 " +
        className
      }
      {...props}
    />
  );
}
