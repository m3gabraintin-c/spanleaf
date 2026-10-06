"use client";
import { cropFromView, MAX_ZOOM, photoAspect, viewFromCrop, type CropView } from "@/lib/crop";
import { Button, EmptyState, Slider } from "@/ui";
import { useEditor } from "../store";

/** Zoom into a photo and choose which part of it shows in its frame. */
export function CropPanel() {
  const elements = useEditor((s) => s.doc.elements);
  const selectedId = useEditor((s) => s.selectedId);
  const updateElement = useEditor((s) => s.updateElement);
  const el = elements.find((e) => e.id === selectedId);

  if (!el || el.type !== "image") {
    return <EmptyState title="Select a photo" as="h3" body="Click a photo on the canvas, then zoom and move the part of it that shows." />;
  }

  const aspect = photoAspect(el);
  const view = viewFromCrop(aspect, el.w, el.h, el.crop);
  const set = (patch: Partial<CropView>, prop: string) =>
    updateElement(el.id, { crop: cropFromView(aspect, el.w, el.h, { ...view, ...patch }) }, { key: `crop:${el.id}:${prop}` });
  const pct = (v: number) => Math.round(v * 100);

  return (
    <div className="flex flex-col gap-4">
      <Slider label="Zoom" min={1} max={MAX_ZOOM} step={0.05} value={Math.round(view.zoom * 100) / 100} onValueChange={(zoom) => set({ zoom }, "zoom")} />
      <Slider label="Left to right" min={0} max={100} value={pct(view.x)} onValueChange={(v) => set({ x: v / 100 }, "x")} />
      <Slider label="Top to bottom" min={0} max={100} value={pct(view.y)} onValueChange={(v) => set({ y: v / 100 }, "y")} />
      <Button variant="secondary" size="sm" disabled={el.locked} onClick={() => set({ zoom: 1, x: 0.5, y: 0.5 }, "reset")}>
        Fill the frame
      </Button>
      {el.locked ? <p className="text-xs text-muted">This layer is locked. Unlock it to edit it.</p> : null}
      <p className="text-xs text-muted">If the photo is the same shape as its frame, moving it does nothing until you zoom in.</p>
    </div>
  );
}
