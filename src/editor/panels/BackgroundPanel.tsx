"use client";
import { inkFor } from "@/lib/colour";
import { makePattern } from "@/lib/pattern";
import { Button, ColourPicker, SegmentedControl } from "@/ui";
import { useEditor } from "../store";

const WHITE = "#ffffff";
const PATTERN_OPTIONS = [
  { value: "none", label: "None" },
  { value: "grid", label: "Grid" },
  { value: "dots", label: "Dots" },
  { value: "lines", label: "Lines" },
] as const;

export function BackgroundPanel() {
  const colour = useEditor((s) => s.doc.background.value);
  const pattern = useEditor((s) => s.doc.pattern);
  const setBackground = useEditor((s) => s.setBackground);
  const setPattern = useEditor((s) => s.setPattern);
  return (
    <div className="flex flex-col gap-4">
      <ColourPicker label="Slide background" value={colour} onValueChange={setBackground} />
      <Button variant="secondary" size="sm" disabled={colour.toLowerCase() === WHITE} onClick={() => setBackground(WHITE)}>
        Reset to white
      </Button>
      <SegmentedControl
        label="Pattern"
        value={pattern?.kind ?? "none"}
        onValueChange={(kind) => setPattern(kind === "none" ? null : makePattern(kind, colour, inkFor(colour, "#1a1a1a")))}
        options={[...PATTERN_OPTIONS]}
      />
      <p className="text-sm text-muted">The colour and pattern behind every slide. Photos and text sit on top of them.</p>
    </div>
  );
}
