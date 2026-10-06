import { cn } from "./cn";

/** A grey block that pulses where something is still loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-hover", className)} />;
}
