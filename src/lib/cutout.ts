import type { Element } from "./doc";
import { sourceRect } from "./geometry";

/**
 * What happens after a model has said which pixels are the object: tidy the mask, make the background
 * transparent, add a die-cut style border if asked, trim to the object, and work out where the new layer goes.
 * The model itself is in matting.ts.
 */

export interface Rgba {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CutoutResult {
  /** The photo with its background gone and the border drawn, with a margin round it for the border. */
  image: Rgba;
  /** The margin added on every side. A point in the photo is at (x + pad, y + pad) in the image. */
  pad: number;
  /** Where the object is in the image, or null if nothing was left. */
  bounds: Box | null;
  /** The share of the photo that was kept, 0 to 1. Near 0 or near 1 means no clear object was found. */
  share: number;
}

// ---- tidying the mask ------------------------------------------------------------------------

/** Keeps the big pieces of the object and drops specks. Works on a 0 or 1 mask. */
export function dropSpecks(fg: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h);
  const sizes: number[] = [0];
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!fg[start] || label[start]) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    label[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const near = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
      for (const j of near) {
        if (j >= 0 && fg[j] && !label[j]) {
          label[j] = id;
          queue[tail++] = j;
        }
      }
    }
    sizes.push(tail);
  }
  const biggest = Math.max(0, ...sizes);
  const least = Math.max(20, biggest * 0.06, w * h * 0.0005);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (fg[i] && sizes[label[i]] >= least) out[i] = 1;
  return out;
}

/** Removes pieces of the mask that are too small to be the object, keeping the soft edges of the pieces that stay. */
export function cleanMask(mask: Uint8ClampedArray, w: number, h: number): { mask: Uint8ClampedArray; share: number } {
  const fg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fg[i] = mask[i] >= 128 ? 1 : 0;
  const kept = dropSpecks(fg, w, h);
  const out = new Uint8ClampedArray(w * h);
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    // A soft edge pixel stays if it is next to a piece that stayed, so edges don't get a hard rim.
    if (kept[i] || (mask[i] > 0 && !fg[i] && touches(kept, w, h, i))) out[i] = mask[i];
    count += kept[i];
  }
  return { mask: out, share: count / (w * h) };
}

function touches(kept: Uint8Array, w: number, h: number, i: number) {
  const x = i % w;
  const y = (i - x) / w;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && xx < w && yy >= 0 && yy < h && kept[yy * w + xx]) return true;
    }
  }
  return false;
}

/** The photo with the mask as its transparency. The photo's own transparency is kept. */
export function applyMask(img: Rgba, mask: Uint8ClampedArray): Rgba {
  const data = new Uint8ClampedArray(img.data);
  for (let i = 0; i < img.w * img.h; i++) data[i * 4 + 3] = Math.round((img.data[i * 4 + 3] * mask[i]) / 255);
  return { data, w: img.w, h: img.h };
}

// ---- border ----------------------------------------------------------------------------------

/** For every pixel, the squared distance to the nearest pixel that is on (Felzenszwalb and Huttenlocher). */
export function squaredDistanceToSet(on: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = on[i] ? 0 : INF;
  const size = Math.max(w, h);
  const line = new Float32Array(size);
  const res = new Float32Array(size);
  const v = new Int32Array(size);
  const z = new Float32Array(size + 1);
  const pass = (n: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s: number;
      for (;;) {
        s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        if (s <= z[k] && k > 0) k--;
        else break;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      res[q] = (q - v[k]) ** 2 + line[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) line[y] = out[y * w + x];
    pass(h);
    for (let y = 0; y < h; y++) out[y * w + x] = res[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) line[x] = out[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) out[y * w + x] = res[x];
  }
  return out;
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Grows the picture by margin on every side, with nothing in the new space. */
export function pad(img: Rgba, margin: number): Rgba {
  if (margin === 0) return img;
  const w = img.w + margin * 2;
  const h = img.h + margin * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < img.h; y++) data.set(img.data.subarray(y * img.w * 4, (y + 1) * img.w * 4), ((y + margin) * w + margin) * 4);
  return { data, w, h };
}

/**
 * A solid border round whatever is not transparent, width pixels thick, with soft edges, and the picture on top.
 * The picture must already have room for it (see pad).
 */
export function addOutline(img: Rgba, width: number, color: string): Rgba {
  const { w, h } = img;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = img.data[i * 4 + 3] >= 128 ? 1 : 0;
  const d2 = squaredDistanceToSet(on, w, h);
  const [r, g, b] = hexRgb(color);
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < w * h; i++) {
    const border = Math.min(1, Math.max(0, width + 0.5 - Math.sqrt(d2[i])));
    const sa = img.data[i * 4 + 3] / 255;
    const a = sa + border * (1 - sa);
    if (a === 0) continue;
    const under = (border * (1 - sa)) / a;
    const over = sa / a;
    data[i * 4] = img.data[i * 4] * over + r * under;
    data[i * 4 + 1] = img.data[i * 4 + 1] * over + g * under;
    data[i * 4 + 2] = img.data[i * 4 + 2] * over + b * under;
    data[i * 4 + 3] = a * 255;
  }
  return { data, w, h };
}

// ---- finishing -------------------------------------------------------------------------------

/** The smallest box round everything that isn't nearly transparent, or null if nothing is. */
export function subjectBounds(img: Rgba, minAlpha = 8): Box | null {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] >= minAlpha) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Just the part of the picture inside the box. */
export function cropTo(img: Rgba, box: Box): Rgba {
  const data = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) data.set(img.data.subarray(((box.y + y) * img.w + box.x) * 4, ((box.y + y) * img.w + box.x + box.w) * 4), y * box.w * 4);
  return { data, w: box.w, h: box.h };
}

/** Cuts the background away with the mask, adds a border if asked, and says where the object is. */
export function finishCutout(img: Rgba, mask: Uint8ClampedArray, outline: { width: number; color: string } | null): CutoutResult {
  const cleaned = cleanMask(mask, img.w, img.h);
  const border = outline && outline.width > 0 ? outline : null;
  const margin = border ? Math.ceil(border.width) + 2 : 0;
  let image = pad(applyMask(img, cleaned.mask), margin);
  if (border) image = addOutline(image, border.width, border.color);
  return { image, pad: margin, bounds: subjectBounds(image), share: cleaned.share };
}

// ---- putting the cut-out back in the project -------------------------------------------------

/**
 * The part of a photo a layer shows, as a source rectangle in the photo and the size to work at, at most maxEdge
 * on the longest side. Cutting out is done on what the layer shows, not on the whole photo.
 */
export function visibleRegion(el: Pick<Element, "crop">, photoW: number, photoH: number, maxEdge: number) {
  const { sx, sy, sw, sh } = sourceRect(el.crop, photoW, photoH);
  const k = Math.min(1, maxEdge / Math.max(sw, sh));
  return { sx, sy, sw, sh, w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
}

/**
 * Where the cut-out goes so the object stays exactly where it was on the slide. The old layer showed a working
 * picture of work.w by work.h in its box, and the cut-out is the piece of that picture inside piece. The old layer
 * may be turned, and turns about its top-left corner, so the piece's corner is carried round with it.
 */
export function placeCutout(el: Pick<Element, "x" | "y" | "w" | "h" | "rotation">, work: { w: number; h: number }, piece: Box) {
  const sx = el.w / work.w;
  const sy = el.h / work.h;
  const a = (el.rotation * Math.PI) / 180;
  const lx = piece.x * sx;
  const ly = piece.y * sy;
  return {
    x: el.x + lx * Math.cos(a) - ly * Math.sin(a),
    y: el.y + lx * Math.sin(a) + ly * Math.cos(a),
    w: piece.w * sx,
    h: piece.h * sy,
  };
}
