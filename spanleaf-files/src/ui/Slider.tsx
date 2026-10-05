"use client";
import * as RSlider from "@radix-ui/react-slider";
import { useId } from "react";

export function Slider({
  label,
  value,
  onValueChange,
  min = -100,
  max = 100,
  step = 1,
}: {
  label: string;
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label id={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <output aria-live="off" className="text-sm tabular-nums text-muted">
          {value}
        </output>
      </div>
      <RSlider.Root
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
        min={min}
        max={max}
        step={step}
        className="relative flex h-6 touch-none items-center select-none pointer-coarse:h-11"
      >
        <RSlider.Track className="relative h-1 grow rounded-pill bg-line">
          <RSlider.Range className="absolute h-full rounded-pill bg-accent" />
        </RSlider.Track>
        <RSlider.Thumb
          aria-labelledby={id}
          className="block size-5 rounded-pill border-2 border-accent bg-page shadow-card pointer-coarse:size-6"
        />
      </RSlider.Root>
    </div>
  );
}
