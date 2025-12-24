import React from "react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={
        "rounded-xl2 border border-slate-200 bg-white shadow-soft " +
        "backdrop-blur supports-[backdrop-filter]:bg-white/80 " +
        className
      }
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={"p-5 border-b border-slate-100 " + className} {...props} />;
}

export function CardContent({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={"p-5 " + className} {...props} />;
}
