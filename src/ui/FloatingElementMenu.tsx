"use client";
import { Copy, Lock, LockOpen, Trash2 } from "lucide-react";
import { IconButton } from "./IconButton";

/** Appears next to the selected element. Position comes from the parent. */
export function FloatingElementMenu({
  locked,
  onDuplicate,
  onToggleLock,
  onDelete,
}: {
  locked: boolean;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Selected element"
      className="inline-flex gap-1 rounded-md border border-line bg-page p-1 shadow-pop"
    >
      <IconButton label="Duplicate" onClick={onDuplicate}>
        <Copy aria-hidden className="size-4" />
      </IconButton>
      <IconButton label={locked ? "Unlock" : "Lock"} pressed={locked} onClick={onToggleLock}>
        {locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
      </IconButton>
      <IconButton label="Delete" tone="danger" disabled={locked} onClick={onDelete}>
        <Trash2 aria-hidden className="size-4" />
      </IconButton>
    </div>
  );
}
