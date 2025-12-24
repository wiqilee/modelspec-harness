// components/ui/Button.tsx
import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

/**
 * A small, reliable button component.
 * Key guarantees:
 * - Forwards *all* native button props (onClick, type, disabled, etc.)
 * - Defaults type="button" (prevents accidental form submits)
 * - Uses a valid Tailwind radius class (rounded-2xl), not "rounded-xl2"
 */
export const Button = React.forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className = "", type, ...props },
  ref
) {
  const base =
    "inline-flex items-center justify-center rounded-2xl font-medium transition " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-300 " +
    "disabled:opacity-50 disabled:cursor-not-allowed";

  const variants: Record<Props["variant"] & string, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200",
    ghost: "bg-transparent text-slate-900 hover:bg-slate-100",
  };

  const sizes: Record<Props["size"] & string, string> = {
    sm: "h-9 px-3 text-sm",
    md: "h-10 px-4 text-sm",
  };

  return (
    <button
      ref={ref}
      // IMPORTANT: default to "button" so clicks don't accidentally submit a form
      type={type ?? "button"}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});

Button.displayName = "Button";
