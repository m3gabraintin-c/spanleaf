"use client";
import { ADJUST_PRESETS, isAdjusted, NO_ADJUST } from "@/lib/adjust";
import type { Adjust } from "@/lib/look";
import { Button, EmptyState, Slider } from "@/ui";
import { cn } from "@/ui/cn";
import { useEditor } from "../store";

const CONTROLS: { key: keyof Adjust; label: string }[] = [
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Colour" },
  { key: "warmth", label: "Warmth" },
];

const same = (a: Adjust, b: Adjust) => CONTROLS.every(({ key }) => a[key] === b[key]);

/** Change how a photo looks: a ready-made look, or brightness, contrast, colour and warmth. */
export function AdjustPanel() {
  const elements = useEditor((s) => s.doc.elements);
  const selectedId = useEditor((s) => s.selectedId);
  const updateElement = useEditor((s) => s.updateElement);
  const el = elements.find((e) => e.id === selectedId);

  if (!el || el.type !== "image") {
    return <EmptyState title="Select a photo" as="h3" body="Click a photo on the canvas to change its brightness, contrast, colour and warmth." />;
  }

  const current = el.adjust ?? NO_ADJUST;
  const set = (adjust: Adjust, prop: string) => updateElement(el.id, { adjust: isAdjusted(adjust) ? adjust : undefined }, { key: `adjust:${el.id}:${prop}` });

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Looks" className="grid grid-cols-3 gap-2">
        {ADJUST_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={same(current, p.adjust)}
            disabled={el.locked}
            onClick={() => set(p.adjust, "preset")}
            className={cn("h-9 rounded-md border-2 text-sm font-medium t-fast disabled:opacity-50", same(current, p.adjust) ? "border-accent text-ink" : "border-line text-muted hover:border-field")}
          >
            {p.name}
          </button>
        ))}
      </div>
      {CONTROLS.map(({ key, label }) => (
        <Slider key={key} label={label} min={-100} max={100} value={current[key]} onValueChange={(v) => set({ ...current, [key]: v }, key)} />
      ))}
      <Button variant="secondary" size="sm" disabled={el.locked || !isAdjusted(el.adjust)} onClick={() => set(NO_ADJUST, "reset")}>
        Reset
      </Button>
      {el.locked ? <p className="text-xs text-muted">This layer is locked. Unlock it to edit it.</p> : null}
    </div>
  );
}
