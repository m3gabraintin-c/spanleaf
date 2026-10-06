import { Layer, StrokeData, uid } from "./carouselModel";

export type Point = { x: number; y: number };
export type PenMode = "pen" | "highlighter" | "eraser";

export const MAX_STROKE_POINTS = 200;
export const PEN_COLOURS = ["#111111", "#ffffff", "#e5484d", "#f76b15", "#ffd60a", "#30a46c", "#0090ff", "#8e4ec6", "#f66dbb"];

const distToSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Drops points within eps of the line between their neighbours (Ramer, Douglas, Peucker). Ends are kept. */
export const simplify = (pts: Point[], eps: number): Point[] => {
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
};

const simplifyTo = (pts: Point[], max: number, eps: number) => {
  let out = simplify(pts, eps);
  while (out.length > max) {
    eps *= 1.6;
    out = simplify(pts, eps);
  }
  return out;
};

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** A drawing layer for one stroke. Points are saved as fractions of the layer's box, so it scales with the layer. */
export const strokeLayer = (points: Point[], style: { color: string; width: number; opacity: number }): Layer => {
  const pts = simplifyTo(points, MAX_STROKE_POINTS, Math.max(0.5, style.width * 0.12));
  const pad = style.width / 2 + 2;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = round(Math.min(...xs) - pad, 2);
  const y = round(Math.min(...ys) - pad, 2);
  const w = round(Math.max(...xs) - Math.min(...xs) + pad * 2, 2);
  const h = round(Math.max(...ys) - Math.min(...ys) + pad * 2, 2);
  return {
    id: uid(),
    type: "drawing",
    name: "Drawing",
    x,
    y,
    w,
    h,
    rotation: 0,
    locked: false,
    opacity: style.opacity < 1 ? style.opacity : undefined,
    stroke: { color: style.color, width: style.width, points: pts.flatMap((p) => [round((p.x - x) / w, 4), round((p.y - y) / h, 4)]) },
  };
};

/** A stroke's points in the layer's own pixels. */
export const localPoints = (l: { w: number; h: number; stroke?: StrokeData }): Point[] => {
  const flat = l.stroke?.points ?? [];
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i] * l.w, y: flat[i + 1] * l.h });
  return out;
};

/** Whether p, in canvas pixels, is within radius of the drawn line, allowing for the layer being moved and turned. */
export const strokeHit = (l: Layer, p: Point, radius: number): boolean => {
  if (!l.stroke) return false;
  const a = (l.rotation * Math.PI) / 180;
  const dx = p.x - l.x;
  const dy = p.y - l.y;
  const local = { x: dx * Math.cos(a) + dy * Math.sin(a), y: -dx * Math.sin(a) + dy * Math.cos(a) };
  const reach = radius + l.stroke.width / 2;
  const pts = localPoints(l);
  if (pts.length === 1) return Math.hypot(local.x - pts[0].x, local.y - pts[0].y) <= reach;
  for (let i = 0; i + 1 < pts.length; i++) if (distToSegment(local, pts[i], pts[i + 1]) <= reach) return true;
  return false;
};

/** Lays out a smooth line through the points: curves through the middle of each pair. */
export const tracePath = (
  c: { beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; quadraticCurveTo(a: number, b: number, c: number, d: number): void },
  pts: Point[],
) => {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    c.lineTo(pts[0].x + 0.01, pts[0].y);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
};
