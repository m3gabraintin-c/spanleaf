"use client";
import type { ComponentType, ReactNode } from "react";
import { IconButton } from "./IconButton";
import { cn } from "./cn";
import { X } from "lucide-react";

export interface ToolItem {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

/** Vertical rail from 1024 px up, bottom bar below. */
export function ToolRail({
  tools,
  active,
  onChange,
}: {
  tools: ToolItem[];
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
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  /** Heading level. Use h1 when the empty state is the whole page, h3 inside a panel. */
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-field p-8 text-center">
      {icon ? (
        <div aria-hidden className="grid size-12 place-items-center rounded-pill bg-surface text-muted">
          {icon}
        </div>
      ) : null}
      <Heading className="text-lg font-semibold text-ink">{title}</Heading>
      <p className="max-w-xs text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}
