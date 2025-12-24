// components/SectionTitle.tsx
import React from "react";

type Props = {
  title: string;
  desc?: string;
  /**
   * Optional small helper text shown in a subtle pill on the right.
   * Example: "YAML", "Registry-only", "Local-only"
   */
  meta?: string;
  /**
   * Optional tooltip/help text. Uses native title attribute (no extra libs).
   */
  help?: string;
  className?: string;
};

export function SectionTitle({ title, desc, meta, help, className = "" }: Props) {
  return (
    <div className={`mb-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-slate-900">{title}</div>
          {desc ? (
            <div className="mt-0.5 text-xs leading-5 text-slate-600">{desc}</div>
          ) : null}
        </div>

        {(meta || help) ? (
          <div className="flex items-center gap-2">
            {meta ? (
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm">
                {meta}
              </span>
            ) : null}

            {help ? (
              <span
                title={help}
                aria-label="Help"
                className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm0 15a1.25 1.25 0 1 1 0 2.5A1.25 1.25 0 0 1 12 17Zm1.2-3.9v.5h-2.3v-.9c0-1.6 1-2.3 2-2.9c.7-.4 1.2-.8 1.2-1.6c0-.9-.7-1.5-1.7-1.5c-1 0-1.6.5-1.9 1.4l-2-.8C9 5.6 10.3 4.5 12.4 4.5c2.2 0 3.8 1.2 3.8 3.2c0 1.8-1.2 2.7-2.4 3.4c-.7.4-1.6.9-1.6 2Z"
                  />
                </svg>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
