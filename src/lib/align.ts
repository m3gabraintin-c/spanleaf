import type { Element } from "./doc";
import { SLIDE_WIDTH } from "./formats";
import { slideOf } from "./slides";

export const ALIGNMENTS = ["left", "centre", "right", "top", "middle", "bottom"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

type Placed = Pick<Element, "x" | "y" | "w" | "h" | "rotation">;

/** The box a layer fills on the canvas. A layer turns about its top-left corner, so a turned one reaches further than x and y say. */
export function boundsOf(e: Placed) {
  const a = (e.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const xs = [0, e.w, 0, e.w].map((lx, i) => e.x + lx * cos - [0, 0, e.h, e.h][i] * sin);
  const ys = [0, e.w, 0, e.w].map((lx, i) => e.y + lx * sin + [0, 0, e.h, e.h][i] * cos);
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Where a layer goes to line up with the edge or middle of the slide it is on, a slide being SLIDE_WIDTH wide and
 * height tall. The layer's turned shape is what lines up, not its unturned box. A layer off either end of the
 * carousel lines up with the nearest slide.
 */
export function alignedPosition(e: Placed, how: Alignment, slideCount: number, height: number) {
  const slide = Math.min(slideCount - 1, Math.max(0, slideOf(e)));
  const box = boundsOf(e);
  const left = slide * SLIDE_WIDTH;
  let dx = 0;
  let dy = 0;
  if (how === "left") dx = left - box.l;
  if (how === "right") dx = left + SLIDE_WIDTH - box.r;
  if (how === "centre") dx = left + SLIDE_WIDTH / 2 - (box.l + box.r) / 2;
  if (how === "top") dy = -box.t;
  if (how === "bottom") dy = height - box.b;
  if (how === "middle") dy = height / 2 - (box.t + box.b) / 2;
  return { x: round2(e.x + dx), y: round2(e.y + dy) };
}
