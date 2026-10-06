"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required. An icon alone is not a name. */
  label: string;
  children: ReactNode;
  pressed?: boolean;
  tone?: "default" | "danger";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, pressed, tone = "default", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "inline-grid size-9 place-items-center rounded-md t-fast pointer-coarse:size-11",
        "disabled:opacity-50 disabled:pointer-events-none",
        pressed ? "bg-accent-soft text-accent" : "text-ink hover:bg-surface-hover active:bg-surface-hover",
        tone === "danger" && !pressed && "text-danger",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
