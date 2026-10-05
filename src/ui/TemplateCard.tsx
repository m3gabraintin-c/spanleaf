"use client";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function TemplateCard({
  title,
  styleTag,
  premium,
  ratio = "4 / 5",
  thumbnail,
  onSelect,
}: {
  title: string;
  styleTag: string;
  premium?: boolean;
  ratio?: string;
  thumbnail?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full flex-col gap-2 rounded-lg text-left"
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-md border border-line bg-canvas t-fast",
          "group-hover:shadow-card",
        )}
        style={{ aspectRatio: ratio }}
      >
        {thumbnail}
        {premium ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-pill bg-page px-2 py-1 text-xs font-medium text-ink shadow-card">
            <Lock aria-hidden className="size-3" />
            Premium
          </span>
        ) : null}
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-muted">{styleTag}</p>
      </div>
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-hover", className)} />;
}
