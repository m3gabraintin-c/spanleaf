"use client";
import { useState } from "react";
import { changeFormat } from "@/lib/resize";
import { FORMAT_KEYS, FORMATS, type FormatKey } from "@/lib/formats";
import { SegmentedControl } from "@/ui";
import { useEditor } from "../store";

/** Changes the shape of every slide. */
export function SizePanel() {
  const format = useEditor((s) => s.format);
  const slideCount = useEditor((s) => s.slideCount);
  const doc = useEditor((s) => s.doc);
  const setFormat = useEditor((s) => s.setFormat);
  const announce = useEditor((s) => s.announce);
  const [error, setError] = useState<string>();

  const change = (to: FormatKey) => {
    if (to === format) return;
    try {
      setFormat(to, changeFormat(doc, { from: format, to, slideCount }));
      setError(undefined);
      announce(`Slides are now ${FORMATS[to].name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the format.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Slide shape"
        value={format}
        onValueChange={change}
        options={FORMAT_KEYS.map((k) => ({ value: k, label: FORMATS[k].label }))}
      />
      <p className="text-sm text-muted">{FORMATS[format].name}, {FORMATS[format].width} by {FORMATS[format].height}.</p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-muted">
        A carousel made from photos is arranged again for the new shape. Otherwise everything keeps its place relative to the middle of the slide, so a shorter slide can leave things off the edge. They stay in the Layers list. Undo changes it back, and so does choosing the old shape again.
      </p>
    </div>
  );
}
