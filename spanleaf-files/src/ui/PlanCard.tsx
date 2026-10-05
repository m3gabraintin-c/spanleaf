"use client";
import { Check } from "lucide-react";
import { cn } from "./cn";

export function PlanCard({
  name,
  price,
  period,
  blurb,
  features,
  badge,
  selected,
  onSelect,
}: {
  name: string;
  price: string;
  period?: string;
  blurb: string;
  features: string[];
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-4 rounded-lg border-2 bg-page p-6 text-left t-fast",
        selected ? "border-accent shadow-card" : "border-line hover:border-field",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold text-ink">{name}</span>
        {badge ? (
          <span className="rounded-pill bg-accent-soft px-3 py-1 text-xs font-medium text-accent">{badge}</span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-ink">{price}</span>
        {period ? <span className="text-sm text-muted">{period}</span> : null}
      </div>
      <p className="text-sm text-muted">{blurb}</p>
      <ul className="flex flex-col gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-ink">
            <Check aria-hidden className="size-4 shrink-0 text-success" strokeWidth={3} />
            {f}
          </li>
        ))}
      </ul>
    </button>
  );
}
