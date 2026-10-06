import { adjustPixels, isAdjusted } from "@/lib/adjust";
import type { Adjust } from "@/lib/look";

/** The longest side an adjusted copy is made at. Slides are 1080 wide, so more than this is wasted work. */
export const ADJUST_EDGE = 1600;
const KEEP = 4;

type Canvas = HTMLCanvasElement;
type Source = HTMLImageElement;

const copies = new WeakMap<Source, Map<string, Canvas>>();

/**
 * The photo with its adjustments applied, ready to draw. A photo with no change comes back as it is. A changed
 * one is copied to a canvas once (at most ADJUST_EDGE on its longest side) and the copy is remembered, so
 * redrawing while dragging costs nothing. Only the last few variants of each photo are kept, so moving a
 * slider doesn't pile up copies.
 */
export function adjustedSource(img: Source, adjust: Adjust | undefined, make: () => Canvas = () => document.createElement("canvas")): Source | Canvas {
  if (!isAdjusted(adjust)) return img;
  const key = `${adjust.brightness},${adjust.contrast},${adjust.saturation},${adjust.warmth}`;
  let byKey = copies.get(img);
  if (!byKey) copies.set(img, (byKey = new Map()));
  const have = byKey.get(key);
  if (have) {
    byKey.delete(key); // most recently used goes last
    byKey.set(key, have);
    return have;
  }

  const scale = Math.min(1, ADJUST_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = make();
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  adjustPixels(pixels.data, adjust);
  ctx.putImageData(pixels, 0, 0);

  byKey.set(key, canvas);
  if (byKey.size > KEEP) byKey.delete(byKey.keys().next().value!);
  return canvas;
}
