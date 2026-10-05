"use client";
import * as RTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={400}>{children}</RTooltip.Provider>;
}

/** Tooltips add a hint for pointer and keyboard users. They never carry the only copy of a label. */
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          sideOffset={6}
          style={{ zIndex: "var(--z-popover)" }}
          className="rounded-sm bg-ink px-2 py-1 text-xs text-page shadow-pop"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
