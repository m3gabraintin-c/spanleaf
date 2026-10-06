"use client";
import { edgeOf, FRAME_EDGES, maskFor, type FrameEdge } from "@/lib/frame";
import { SOFT_SHADOW, WHITE_BORDER } from "@/lib/look";
import { ColourPicker, EmptyState, SegmentedControl, Slider, SwitchField } from "@/ui";
import { useEditor } from "../store";

const EDGE_LABELS: Record<FrameEdge, string> = { square: "Square", rounded: "Soft", torn: "Torn", oval: "Oval" };

/** The cut, border, shadow and see-through level of one photo. */
export function FramesPanel() {
  const elements = useEditor((s) => s.doc.elements);
  const selectedId = useEditor((s) => s.selectedId);
  const updateElement = useEditor((s) => s.updateElement);
  const el = elements.find((e) => e.id === selectedId);

  if (!el || el.type !== "image") {
    return <EmptyState title="Select a photo" as="h3" body="Click a photo on the canvas to change its edges, border and shadow." />;
  }

  const key = (prop: string) => ({ key: `frame:${el.id}:${prop}` });
  const border = el.outline && el.outline.width > 0 ? el.outline : null;

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Edges"
        value={edgeOf(el.mask)}
        onValueChange={(edge) => updateElement(el.id, { mask: maskFor(edge, Math.floor(Math.random() * 1_000_000)) }, key("edges"))}
        options={FRAME_EDGES.map((e) => ({ value: e, label: EDGE_LABELS[e] }))}
      />

      <SwitchField label="Border" checked={!!border} onCheckedChange={(on) => updateElement(el.id, { outline: on ? { ...WHITE_BORDER } : undefined }, key("border"))} />
      {border ? (
        <>
          <Slider label="Border width" min={1} max={40} value={Math.min(40, border.width)} onValueChange={(width) => updateElement(el.id, { outline: { ...border, width } }, key("width"))} />
          <ColourPicker label="Border colour" value={border.color} onValueChange={(color) => updateElement(el.id, { outline: { ...border, color } }, key("colour"))} />
        </>
      ) : null}

      <SwitchField label="Shadow" checked={!!el.shadow} onCheckedChange={(on) => updateElement(el.id, { shadow: on ? { ...SOFT_SHADOW } : undefined }, key("shadow"))} />
      <Slider label="Opacity" min={10} max={100} value={Math.round((el.opacity ?? 1) * 100)} onValueChange={(v) => updateElement(el.id, { opacity: v === 100 ? undefined : v / 100 }, key("opacity"))} />
      {el.locked ? <p className="text-xs text-muted">This layer is locked. Unlock it to edit it.</p> : null}
    </div>
  );
}
