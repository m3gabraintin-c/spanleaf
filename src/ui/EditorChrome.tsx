"use client";
import { Image, Type, Sticker, Frame, Pencil, PaintBucket, SlidersHorizontal } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { IconButton } from "./IconButton";
import { cn } from "./cn";
import { X } from "lucide-react";

/**
 * Visual spec for the on-canvas parts. The real canvas is drawn by Konva (see src/editor/CanvasStage.tsx).
 * These pieces pin down sizes, colours and hit areas so the Konva version matches.
 */

const HANDLES = ["top-0 left-0", "top-0 left-1/2", "top-0 right-0", "top-1/2 left-0", "top-1/2 right-0", "bottom-0 left-0", "bottom-0 left-1/2", "bottom-0 right-0"];

export function SelectionBox({ locked, children }: { locked?: boolean; children?: ReactNode }) {
  return (
    <div className={cn("absolute inset-0 border-2", locked ? "border-field border-dashed" : "border-accent")}>
      {locked
        ? null
        : HANDLES.map((pos) => (
            <span
              key={pos}
              aria-hidden
              // 12 px square to look at. On touch the hit area grows to 44 px.
              className={cn(
                "absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-accent bg-page",
                "before:absolute before:-inset-4 before:content-[''] pointer-fine:before:hidden",
                pos,
              )}
            />
          ))}
      {children}
    </div>
  );
}

export function GuideLine({ orientation, at }: { orientation: "vertical" | "horizontal"; at: string }) {
  return orientation === "vertical" ? (
    <div aria-hidden className="absolute top-0 bottom-0 w-px bg-guide" style={{ left: at }} />
  ) : (
    <div aria-hidden className="absolute right-0 left-0 h-px bg-guide" style={{ top: at }} />
  );
}

export function SlideStrip({ slides = 3, slideWidth = 160, ratio = 1.25, label = "Slides" }: { slides?: number; slideWidth?: number; ratio?: number; label?: string }) {
  const h = slideWidth * ratio;
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-md bg-canvas p-6">
      <div className="relative mx-auto shadow-slide" style={{ width: slideWidth * slides, height: h }}>
        <div className="absolute inset-0 flex bg-page">
          {Array.from({ length: slides }).map((_, i) => (
            <div key={i} className={cn("h-full flex-1", i > 0 && "border-l border-field")} />
          ))}
        </div>
        {/* A photo placeholder that crosses the first slide divider. */}
        <div
          className="absolute rounded-sm bg-accent-soft"
          style={{ left: slideWidth * 0.55, top: h * 0.2, width: slideWidth * 0.9, height: h * 0.45 }}
        >
          <SelectionBox />
        </div>
        <GuideLine orientation="vertical" at={`${slideWidth}px`} />
      </div>
      <div className="mx-auto mt-3 flex text-xs text-muted" style={{ width: slideWidth * slides }}>
        {Array.from({ length: slides }).map((_, i) => (
          <span key={i} className="flex-1 text-center">
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface ToolItem {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export const DEFAULT_TOOLS: ToolItem[] = [
  { key: "media", label: "Media", icon: Image },
  { key: "text", label: "Text", icon: Type },
  { key: "stickers", label: "Stickers", icon: Sticker },
  { key: "frames", label: "Frames", icon: Frame },
  { key: "draw", label: "Draw", icon: Pencil },
  { key: "background", label: "Colour", icon: PaintBucket },
  { key: "adjust", label: "Adjust", icon: SlidersHorizontal },
];

/** Vertical rail from 1024 px up, bottom bar below. */
export function ToolRail({
  tools = DEFAULT_TOOLS,
  active,
  onChange,
}: {
  tools?: ToolItem[];
  active: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <nav
      aria-label="Editor tools"
      className="flex shrink-0 overflow-x-auto border-t border-line bg-page lg:w-(--layout-tool-rail) lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-t-0 lg:border-r"
    >
      {tools.map(({ key, label, icon: Icon }) => {
        const on = key === active;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={cn(
              "flex min-h-(--layout-bottom-bar) min-w-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium t-fast lg:min-h-16 lg:flex-none",
              on ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-hover hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-5" />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

/** Side panel on desktop, bottom sheet on phones. */
export function ToolPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex max-h-[42dvh] w-full flex-col gap-4 overflow-y-auto border-t border-line bg-page p-4 lg:max-h-none lg:w-(--layout-side-panel) lg:border-t-0 lg:border-l"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <IconButton label={`Close ${title}`} onClick={onClose}>
          <X aria-hidden className="size-5" />
        </IconButton>
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  as: Heading = "h2",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  /** Heading level. Use h1 when the empty state is the whole page, h3 inside a panel. */
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-field p-8 text-center">
      <div aria-hidden className="grid size-12 place-items-center rounded-pill bg-surface text-muted">
        {icon}
      </div>
      <Heading className="text-lg font-semibold text-ink">{title}</Heading>
      <p className="max-w-xs text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}
