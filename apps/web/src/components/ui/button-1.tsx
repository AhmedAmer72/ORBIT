"use client";

import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

interface GradientButtonProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  width?: string;
  height?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** In-app route. Renders a link with the same gradient treatment. */
  to?: string;
}

const GradientButton = ({
  children,
  width = "600px",
  height = "100px",
  className = "",
  onClick,
  disabled = false,
  to,
  ...props
}: GradientButtonProps) => {
  const commonGradientStyles = `
    relative rounded-[50px] cursor-pointer
    after:content-[""] after:block after:absolute after:bg-[var(--color-background)]
    after:inset-[5px] after:rounded-[45px] after:z-[1]
    after:transition-opacity after:duration-300 after:ease-linear
    flex items-center justify-center
    ${disabled ? "opacity-50 cursor-not-allowed" : ""}
  `;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  const classes = `
    ${commonGradientStyles}
    rotatingGradient
    text-sm font-semibold no-underline
    ${className}
  `;

  const style = {
    "--r": "0deg",
    width,
    minWidth: width,
    height,
  } as CSSProperties;

  const label = (
    <span className="label relative z-10 flex items-center justify-center text-[var(--color-text)]">{children}</span>
  );

  return (
    <div className="inline-flex text-center text-[#eee]">
      {to && !disabled ? (
        <Link to={to} className={classes} style={style} onClick={onClick} aria-disabled={disabled}>
          {label}
        </Link>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          className={classes}
          style={style}
          onClick={disabled ? undefined : onClick}
          onKeyDown={handleKeyDown}
          aria-disabled={disabled}
          {...props}
        >
          {label}
        </div>
      )}
    </div>
  );
};

export default GradientButton;
