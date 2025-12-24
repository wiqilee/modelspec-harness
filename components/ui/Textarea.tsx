import React from "react";

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={
        "w-full min-h-[140px] rounded-xl2 border border-slate-200 bg-white px-3 py-2 text-sm " +
        "shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 " +
        className
      }
      {...props}
    />
  );
}
