"use client";
import { useState } from "react";
import { Shuffle } from "lucide-react";
import { resolveLook } from "@/lib/compose";
import { restyleDoc } from "@/lib/restyle";
import { customise, readCustomisation, resolveTheme, THEMES, type Customisation, type ThemeChoice } from "@/lib/themes";
import { Button, ColourPicker, SegmentedControl, Slider, SwitchField, ThemePicker } from "@/ui";
import { useEditor } from "../store";

const PATTERN_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "dots", label: "Dots" },
  { value: "lines", label: "Lines" },
  { value: "none", label: "None" },
] as const;
const DECORATION_OPTIONS = [
  { value: "none", label: "None" },
  { value: "some", label: "Some" },
  { value: "lots", label: "Lots" },
] as const;
const EDGE_OPTIONS = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Soft" },
  { value: "torn", label: "Torn" },
  { value: "oval", label: "Oval" },
  { value: "mixed", label: "Mixed" },
] as const;
const CAPTION_OPTIONS = [
  { value: "label", label: "Label" },
  { value: "band", label: "Plain" },
] as const;

/** Lays the carousel out again in another theme, or with your own changes to one. */
export function ThemesPanel() {
  const doc = useEditor((s) => s.doc);
  const format = useEditor((s) => s.format);
  const slideCount = useEditor((s) => s.slideCount);
  const replaceDoc = useEditor((s) => s.replaceDoc);
  const announce = useEditor((s) => s.announce);
  const [error, setError] = useState<string>();
  const meta = doc.compose;

  if (!meta) {
    return <p className="text-sm text-muted">Themes work on carousels made from photos. Start one with &ldquo;Start from photos&rdquo; on your projects page.</p>;
  }

  const theme = resolveTheme(meta.theme);
  const look = resolveLook(theme, meta.plan);
  const values = readCustomisation(theme, look);

  /** Redoes the layout. Quick changes to one control share an undo step, so dragging a slider isn't fifty of them. */
  const apply = (make: () => ThemeChoice, seed: number, opts: { key?: string; message?: string } = {}) => {
    try {
      const next = restyleDoc(doc, { format, slideCount, theme: make(), seed });
      if (!next) {
        setError("There are no photos to arrange.");
        return;
      }
      setError(undefined);
      replaceDoc(next, opts.key);
      if (opts.message) announce(opts.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the theme.");
    }
  };
  const change = (patch: Partial<Customisation>) => apply(() => customise(theme, patch, look), meta.seed, { key: "themes" });

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">Changing the theme rearranges every slide. Text and stickers you added are removed. Undo brings it all back.</p>

      <ThemePicker
        label="Theme"
        value={typeof meta.theme === "string" ? meta.theme : "custom"}
        onValueChange={(id) => id !== "auto" && apply(() => id, meta.seed, { message: `${THEMES[id].name} theme` })}
      />

      <Button variant="secondary" icon={<Shuffle aria-hidden className="size-4" />} onClick={() => apply(() => meta.theme, Math.floor(Math.random() * 1_000_000), { message: "Shuffled the photos" })}>
        Shuffle
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <h3 className="text-sm font-semibold text-ink">Make it your own</h3>
      <ColourPicker label="Background" value={values.background} onValueChange={(background) => change({ background })} />
      <SegmentedControl label="Background pattern" value={values.pattern} onValueChange={(pattern) => change({ pattern })} options={[...PATTERN_OPTIONS]} />
      <Slider label="Tilt" min={0} max={12} step={0.5} value={values.tilt} onValueChange={(tilt) => change({ tilt })} />
      <SegmentedControl label="Tape and doodles" value={values.decorations} onValueChange={(decorations) => change({ decorations })} options={[...DECORATION_OPTIONS]} />
      <SegmentedControl label="Photo edges" value={values.edges} onValueChange={(edges) => change({ edges })} options={[...EDGE_OPTIONS]} />
      <SegmentedControl label="Captions" value={values.caption} onValueChange={(caption) => change({ caption })} options={[...CAPTION_OPTIONS]} />
      <SwitchField label="Photo borders" checked={values.border} onCheckedChange={(border) => change({ border })} />
    </div>
  );
}
