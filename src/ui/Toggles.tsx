"use client";
import * as Switch from "@radix-ui/react-switch";
import { useId } from "react";

export function SwitchField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-10 shrink-0 rounded-pill border border-field bg-page t-fast data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-4 translate-x-1 rounded-pill bg-field t-fast data-[state=checked]:translate-x-5 data-[state=checked]:bg-on-accent" />
      </Switch.Root>
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
    </div>
  );
}
