import type { Crop, Mask } from "./doc";

/** Small seeded generator (mulberry32), so a torn edge is the same every time the document is drawn. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The outline of a w by h element as a closed polygon, flat [x0, y0, x1, y1, ...], in the element's own
 * coordinates (0,0 is its top-left corner). Every point stays inside the 0..w, 0..h box, so the photo
 * underneath always covers the shape.
 */
export function maskPolygon(shape: Mask["shape"], w: number, h: number, opts: { radius?: number; seed?: number } = {}): number[] {
  if (shape === "rect") return [0, 0, w, 0, w, h, 0, h];

  if (shape === "ellipse") {
    const pts: number[] = [];
    const n = 72;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a));
    }
    return pts;
  }

  if (shape === "rounded") {
    const r = Math.min(w, h) * clamp(opts.radius ?? 0.12, 0, 0.5);
    if (r === 0) return [0, 0, w, 0, w, h, 0, h];
    const pts: number[] = [];
    const steps = 8;
    // corner centres and the angle each corner's arc starts at
    const corners: [number, number, number][] = [
      [w - r, r, -Math.PI / 2],
      [w - r, h - r, 0],
      [r, h - r, Math.PI / 2],
      [r, r, Math.PI],
    ];
    for (const [cx, cy, start] of corners) {
      for (let i = 0; i <= steps; i++) {
        const a = start + (i / steps) * (Math.PI / 2);
        pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
    }
    return pts;
  }

  // torn: walk the four edges clockwise and push each point inward by a random amount
  const rand = seeded(opts.seed ?? 1);
  const amp = clamp(Math.min(w, h) * 0.025, 2, 14);
  const step = 26;
  const pts: number[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const d = i === 0 ? 0 : rand() * amp; // corners stay put
      pts.push(x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d);
    }
  };
  edge(0, 0, w, 0, 0, 1);
  edge(w, 0, w, h, -1, 0);
  edge(w, h, 0, h, 0, -1);
  edge(0, h, 0, 0, 1, 0);
  return pts;
}

/**
 * A crop that fills a box of boxW by boxH from an imgW by imgH photo without squashing it, centred on
 * focus (fractions of the photo, default the middle). The layout step uses this for every photo.
 */
export function coverCrop(imgW: number, imgH: number, boxW: number, boxH: number, focus: { x: number; y: number } = { x: 0.5, y: 0.5 }): Crop {
  const imgAspect = imgW / imgH;
  const boxAspect = boxW / boxH;
  let w = 1;
  let h = 1;
  if (imgAspect > boxAspect) w = boxAspect / imgAspect;
  else h = imgAspect / boxAspect;
  return { x: clamp(focus.x - w / 2, 0, 1 - w), y: clamp(focus.y - h / 2, 0, 1 - h), w, h };
}

/** The crop in the photo's own pixels, for drawImage. No crop means the whole photo. */
export function sourceRect(crop: Crop | undefined, imgW: number, imgH: number) {
  if (!crop) return { sx: 0, sy: 0, sw: imgW, sh: imgH };
  return { sx: crop.x * imgW, sy: crop.y * imgH, sw: crop.w * imgW, sh: crop.h * imgH };
}
