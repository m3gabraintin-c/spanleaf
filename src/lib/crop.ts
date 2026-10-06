import type { Crop, Element } from "./doc";
import { coverCrop } from "./geometry";

/**
 * How a person thinks about cropping a photo in its frame: how far in they have zoomed, and where the view
 * is centred. A zoom of 1 fills the frame with as much of the photo as fits, without squashing it.
 */
export interface CropView {
  /** 1 or more. */
  zoom: number;
  /** Where the middle of the view sits, as fractions of the photo (0 left, 1 right). */
  x: number;
  /** 0 top, 1 bottom. */
  y: number;
}

export const MAX_ZOOM = 4;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The photo's own width over height, worked back from its frame and crop. A photo with no crop fills its frame. */
export function photoAspect(e: Pick<Element, "w" | "h" | "crop">): number {
  return (e.w / e.h) * (e.crop ? e.crop.h / e.crop.w : 1);
}

/** The crop for a view of a photo of the given shape in a frame of boxW by boxH. */
export function cropFromView(aspect: number, boxW: number, boxH: number, view: CropView): Crop {
  const fill = coverCrop(aspect * 1000, 1000, boxW, boxH);
  const zoom = clamp(view.zoom, 1, MAX_ZOOM);
  const w = fill.w / zoom;
  const h = fill.h / zoom;
  return { x: clamp(view.x - w / 2, 0, 1 - w), y: clamp(view.y - h / 2, 0, 1 - h), w, h };
}

/** The view a crop amounts to. */
export function viewFromCrop(aspect: number, boxW: number, boxH: number, crop: Crop | undefined): CropView {
  if (!crop) return { zoom: 1, x: 0.5, y: 0.5 };
  const fill = coverCrop(aspect * 1000, 1000, boxW, boxH);
  return { zoom: clamp(fill.w / crop.w, 1, MAX_ZOOM), x: crop.x + crop.w / 2, y: crop.y + crop.h / 2 };
}
