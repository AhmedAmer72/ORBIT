"use client";

import type { ButtonHTMLAttributes } from "react";

export function WriteButton({
  disabledReason,
  tone = "solid",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { disabledReason?: string; tone?: "solid" | "ghost" }) {
  const disabled = Boolean(disabledReason) || props.disabled;
  const look = tone === "ghost" ? "btn btn-ghost" : "btn btn-solid";
  return (
    <div className="space-y-1">
      <button {...props} disabled={disabled} className={look}>
        {children}
      </button>
      {disabledReason ? <p className="text-xs text-muted">{disabledReason}</p> : null}
    </div>
  );
}
