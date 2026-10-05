import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active",
  secondary: "bg-page text-ink border border-field hover:bg-surface-hover active:bg-surface-hover",
  ghost: "bg-transparent text-ink hover:bg-surface-hover active:bg-surface-hover",
  danger: "bg-danger text-on-accent hover:bg-danger-hover active:bg-danger-hover",
};

// 32 / 40 / 48 px. On touch screens every size grows to at least 44 px.
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1 pointer-coarse:min-h-11",
  md: "h-10 px-4 text-sm gap-2 pointer-coarse:min-h-11",
  lg: "h-12 px-6 text-base gap-2",
};

/** Class names for a button. Lives apart from Button.tsx so server components can use it for links. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-md font-semibold select-none t-fast",
    "disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    extra,
  );
}
