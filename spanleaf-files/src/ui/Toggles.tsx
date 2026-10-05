"use client";
import * as Switch from "@radix-ui/react-switch";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
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

export function CheckboxField({
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
    <div className="flex items-start gap-3">
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border border-field bg-page t-fast data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <Checkbox.Indicator>
          <Check aria-hidden className="size-4 text-on-accent" strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
    </div>
  );
}
