"use client";
import { hex6, inkFor } from "@/lib/colour";
import { makePattern } from "@/lib/pattern";
import { Button, ColourPicker, SegmentedControl, Slider, SwitchField } from "@/ui";
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
  const gradient = useEditor((s) => s.doc.gradient);
  const setGradient = useEditor((s) => s.setGradient);
  return (
    <div className="flex flex-col gap-4">
      <ColourPicker label="Slide background" value={colour} onValueChange={setBackground} />
      <Button variant="secondary" size="sm" disabled={colour.toLowerCase() === WHITE} onClick={() => setBackground(WHITE)}>
        Reset to white
      </Button>
      <SwitchField label="Gradient across all slides" checked={!!gradient} onCheckedChange={(on) => setGradient(on ? { from: hex6(colour), to: inkFor(colour, "#1a1a1a") === "#1a1a1a" ? "#ffd6e7" : "#3b3b6b", angle: 90 } : null)} />
      {gradient ? (
        <>
          <ColourPicker label="Gradient start" value={gradient.from} onValueChange={(from) => setGradient({ ...gradient, from })} />
          <ColourPicker label="Gradient end" value={gradient.to} onValueChange={(to) => setGradient({ ...gradient, to })} />
          <Slider label="Gradient angle" min={0} max={360} value={gradient.angle} onValueChange={(angle) => setGradient({ ...gradient, angle })} />
        </>
      ) : null}
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
