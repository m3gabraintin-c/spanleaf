import { uid, type Element } from "./doc";

/** A freehand stroke, from the moment a finger or pen goes down to the moment it lifts. */

export interface Point {
  x: number;
  y: number;
}

/** A stroke is simplified to this many points at most, so a busy drawing still saves and loads quickly. */
export const MAX_STROKE_POINTS = 200;

export const PEN_COLOURS = [
  { name: "Black", value: "#111111" },
  { name: "White", value: "#ffffff" },
  { name: "Red", value: "#e5484d" },
  { name: "Orange", value: "#f76b15" },
  { name: "Yellow", value: "#ffd60a" },
  { name: "Green", value: "#30a46c" },
  { name: "Blue", value: "#0090ff" },
  { name: "Purple", value: "#8e4ec6" },
  { name: "Pink", value: "#f66dbb" },
];

export type PenMode = "pen" | "highlighter" | "eraser";
export interface Pen {
  mode: PenMode;
  color: string;
  /** Pen width in canvas pixels, or the eraser's reach. */
  size: number;
}
export const DEFAULT_PEN: Pen = { mode: "pen", color: PEN_COLOURS[0].value, size: 12 };

export const MIN_PEN_SIZE = 2;
export const MAX_PEN_SIZE = 80;

/** How a stroke looks for the pen in use. A highlighter is wider and see-through. */
export function penStyle(pen: Pen): { color: string; width: number; opacity: number } {
  return pen.mode === "highlighter" ? { color: pen.color, width: pen.size * 2.5, opacity: 0.4 } : { color: pen.color, width: pen.size, opacity: 1 };
}

/** How far an eraser reaches, in canvas pixels. Never so small it can't be aimed. */
export const eraserRadius = (size: number) => Math.max(8, size);

/**
 * Collects the points of a stroke as the pointer moves. A point closer than minDist to the last one is
 * skipped, which keeps a slow hand from making thousands of points.
 */
export class StrokeRecorder {
  private pts: Point[] = [];
  constructor(private readonly minDist: number) {}

  /** Adds a point if it is far enough from the last. Returns whether it was kept. */
  add(p: Point): boolean {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < this.minDist) return false;
    this.pts.push({ ...p });
    return true;
  }

  get points(): readonly Point[] {
    return this.pts;
  }

  /** Ends the stroke at p, so it reaches the spot where the pointer lifted, and returns the points. */
  finish(p: Point): Point[] {
    const last = this.pts[this.pts.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) this.pts.push({ ...p });
    return this.pts.map((q) => ({ ...q }));
  }
}

/** The distance from p to the line segment a to b. */
function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Drops points that lie within eps of the line between their neighbours (Ramer, Douglas, Peucker). The ends always stay. */
export function simplify(pts: readonly Point[], eps: number): Point[] {
  if (pts.length <= 2) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(pts[i], pts[a], pts[b]);
      if (d > far) {
        far = d;
        at = i;
      }
    }
    if (far > eps) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplifies until there are at most max points, loosening the tolerance a little each time. */
export function simplifyTo(pts: readonly Point[], max: number, eps = 0.6): Point[] {
  let out = simplify(pts, eps);
  while (out.length > max) {
    eps *= 1.6;
    out = simplify(pts, eps);
  }
  return out;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * A drawing layer for one stroke. Its box is the stroke's bounds plus room for the pen's width, and the points are
 * saved as fractions of that box, so moving, resizing and turning the layer carries the drawing with it.
 */
export function strokeElement(points: readonly Point[], style: { color: string; width: number; opacity: number }, newId: () => string = uid): Element {
  const pts = simplifyTo(points, MAX_STROKE_POINTS, Math.max(0.5, style.width * 0.12));
  const pad = style.width / 2 + 2;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const x = round(minX - pad, 2);
  const y = round(minY - pad, 2);
  const w = round(maxX - minX + pad * 2, 2);
  const h = round(maxY - minY + pad * 2, 2);
  const flat = pts.flatMap((p) => [round((p.x - x) / w, 4), round((p.y - y) / h, 4)]);
  return {
    id: newId(),
    type: "drawing",
    x,
    y,
    w,
    h,
    rotation: 0,
    locked: false,
    stroke: { color: style.color, width: style.width, points: flat },
    ...(style.opacity < 1 ? { opacity: style.opacity } : {}),
  };
}

/** A stroke layer's points in the layer's own pixels (before it is moved or turned). */
export function localPoints(el: Pick<Element, "w" | "h" | "stroke">): Point[] {
  const flat = el.stroke?.points ?? [];
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i] * el.w, y: flat[i + 1] * el.h });
  return out;
}

/** Whether p, in canvas pixels, is within radius of the drawn line, allowing for the layer being moved and turned. */
export function strokeHit(el: Pick<Element, "x" | "y" | "w" | "h" | "rotation" | "stroke">, p: Point, radius: number): boolean {
  if (!el.stroke) return false;
  const a = (el.rotation * Math.PI) / 180;
  const dx = p.x - el.x;
  const dy = p.y - el.y;
  const local = { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) };
  const reach = radius + el.stroke.width / 2;
  const pts = localPoints(el);
  if (pts.length === 1) return Math.hypot(local.x - pts[0].x, local.y - pts[0].y) <= reach;
  for (let i = 0; i + 1 < pts.length; i++) if (distToSegment(local, pts[i], pts[i + 1]) <= reach) return true;
  return false;
}
