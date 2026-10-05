"use client";
import * as RTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

export function Tabs({ items, defaultValue, label }: { items: TabItem[]; defaultValue?: string; label: string }) {
  return (
    <RTabs.Root defaultValue={defaultValue ?? items[0]?.value} className="flex flex-col gap-3">
      <RTabs.List aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              "h-10 shrink-0 border-b-2 px-3 text-sm font-medium t-fast pointer-coarse:h-11",
              "data-[state=active]:border-accent data-[state=active]:text-ink",
              "data-[state=inactive]:border-transparent data-[state=inactive]:text-muted data-[state=inactive]:hover:text-ink",
            )}
          >
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((t) => (
        <RTabs.Content key={t.value} value={t.value}>
          {t.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
