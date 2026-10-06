"use client";
import { cn } from "./cn";

type ProgressState = "running" | "done" | "failed";

export function ProgressBar({
  label,
  value,
  state = "running",
}: {
  label: string;
  value: number;
  state?: ProgressState;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className={cn("tabular-nums", state === "failed" ? "text-danger" : state === "done" ? "text-success" : "text-muted")}>
          {state === "failed" ? "Failed" : state === "done" ? "Done" : `${pct}%`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 overflow-hidden rounded-pill bg-line"
      >
        <div
          className={cn("h-full rounded-pill t-fast", state === "failed" ? "bg-danger" : state === "done" ? "bg-success" : "bg-accent")}
          style={{ width: `${state === "failed" ? Math.max(pct, 8) : pct}%` }}
        />
      </div>
    </div>
  );
}
