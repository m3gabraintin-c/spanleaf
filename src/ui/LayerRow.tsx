"use client";
import { GripVertical, Image, Lock, LockOpen, Sticker, Type, Video, Frame, Pencil } from "lucide-react";
import type { KeyboardEvent } from "react";
import { IconButton } from "./IconButton";
import { cn } from "./cn";

export type LayerType = "image" | "video" | "text" | "sticker" | "frame" | "drawing";

const icons = { image: Image, video: Video, text: Type, sticker: Sticker, frame: Frame, drawing: Pencil };

export function LayerRow({
  type,
  name,
  selected,
  locked,
  dragging,
  onSelect,
  onToggleLock,
  onMove,
}: {
  type: LayerType;
  name: string;
  selected?: boolean;
  locked?: boolean;
  dragging?: boolean;
  onSelect: () => void;
  onToggleLock: () => void;
  /** Called by Alt+ArrowUp / Alt+ArrowDown, so reordering works without a mouse. */
  onMove: (dir: -1 | 1) => void;
}) {
  const Icon = icons[type];
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); onMove(-1); }
    else if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); onMove(1); }
  };
  // Two sibling buttons, not one control inside another: select, then lock.
  // Render inside a <ul aria-label="Layers">.
  return (
    <li
      className={cn(
        "flex h-10 items-center gap-1 rounded-md px-2 t-fast pointer-coarse:h-11",
        selected ? "bg-accent-soft text-ink" : "hover:bg-surface-hover",
        dragging && "bg-page shadow-pop",
      )}
    >
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        onClick={onSelect}
        onKeyDown={onKey}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
      >
        <GripVertical aria-hidden className="size-4 shrink-0 text-muted" />
        <Icon aria-hidden className="size-4 shrink-0 text-muted" />
        <span className={cn("min-w-0 flex-1 truncate text-sm", locked && "text-muted")}>{name}</span>
      </button>
      <IconButton
        label={locked ? `Unlock ${name}` : `Lock ${name}`}
        pressed={locked}
        onClick={onToggleLock}
        className="size-8"
      >
        {locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
      </IconButton>
    </li>
  );
}
