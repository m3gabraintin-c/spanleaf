"use client";
import { MAX_PEN_SIZE, MIN_PEN_SIZE, PEN_COLOURS, type PenMode } from "@/lib/stroke";
import { Button, ColourPicker, SegmentedControl, Slider } from "@/ui";
import { cn } from "@/ui/cn";
import { useEditor } from "../store";

const MODES: { value: PenMode; label: string }[] = [
  { value: "pen", label: "Pen" },
  { value: "highlighter", label: "Highlighter" },
  { value: "eraser", label: "Eraser" },
];

/** Draw on the slides with a finger, a pen or a mouse. Every stroke is its own layer. */
export function DrawPanel() {
  const pen = useEditor((s) => s.pen);
  const setPen = useEditor((s) => s.setPen);
  const elements = useEditor((s) => s.doc.elements);
  const removeElements = useEditor((s) => s.removeElements);
  const announce = useEditor((s) => s.announce);
  const strokes = elements.filter((e) => e.type === "drawing" && !e.locked);
  const erasing = pen.mode === "eraser";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{erasing ? "Drag over a drawing to rub it out." : "Draw right on the slide. Lift your finger or pen to finish a stroke."}</p>

      <SegmentedControl label="Tool" value={pen.mode} onValueChange={(mode) => setPen({ mode })} options={MODES} />

      {erasing ? null : (
        <>
          <div role="group" aria-label="Colours" className="flex flex-wrap gap-2">
            {PEN_COLOURS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                aria-pressed={pen.color.toLowerCase() === c.value}
                onClick={() => setPen({ color: c.value })}
                style={{ background: c.value }}
                className={cn("size-9 rounded-full border-2 t-fast pointer-coarse:size-11", pen.color.toLowerCase() === c.value ? "border-accent ring-2 ring-accent/30" : "border-line")}
              />
            ))}
          </div>
          <ColourPicker label="Other colour" value={pen.color} onValueChange={(color) => setPen({ color })} />
        </>
      )}

      <Slider label={erasing ? "Eraser size" : "Size"} min={MIN_PEN_SIZE} max={MAX_PEN_SIZE} value={pen.size} onValueChange={(size) => setPen({ size })} />

      <Button
        variant="secondary"
        size="sm"
        disabled={strokes.length === 0}
        onClick={() => {
          removeElements(strokes.map((e) => e.id));
          announce(`Cleared ${strokes.length} ${strokes.length === 1 ? "drawing" : "drawings"}`);
        }}
      >
        Clear all drawings
      </Button>
      <p className="text-xs text-muted">Undo takes back the last stroke. To move or resize a drawing, switch to another tool and tap it.</p>
    </div>
  );
}
