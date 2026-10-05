"use client";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "./cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: SegmentedOption<T>[];
  label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      // Radix lets a single group deselect. A segmented control always has one value.
      onValueChange={(v) => v && onValueChange(v as T)}
      className="inline-flex rounded-md bg-surface p-1"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "h-8 rounded-sm border px-3 text-sm font-medium t-fast pointer-coarse:h-9",
            "data-[state=on]:border-field data-[state=on]:bg-page data-[state=on]:text-ink data-[state=on]:shadow-card",
            "data-[state=off]:border-transparent data-[state=off]:text-muted data-[state=off]:hover:text-ink",
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
