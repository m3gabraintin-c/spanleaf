import { Adjust, Crop } from "./carouselModel";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const MAX_ZOOM = 4;

/**
 * The part of a photo to show in a frame of boxW by boxH, in the photo's own pixels. At zoom 1 it is the largest
 * piece that fits the frame without squashing; zooming in shrinks it; x and y are where its middle sits, 0 to 1.
 */
export const cropRect = (natW: number, natH: number, boxW: number, boxH: number, crop?: Crop) => {
  const boxAspect = boxW / boxH;
  let cw: number;
  let ch: number;
  if (natW / natH > boxAspect) {
    ch = natH;
    cw = natH * boxAspect;
  } else {
    cw = natW;
    ch = natW / boxAspect;
  }
  const z = clamp(crop?.zoom ?? 1, 1, MAX_ZOOM);
  cw /= z;
  ch /= z;
  const x = clamp((crop?.x ?? 0.5) * natW - cw / 2, 0, natW - cw);
  const y = clamp((crop?.y ?? 0.5) * natH - ch / 2, 0, natH - ch);
  return { x, y, width: cw, height: ch };
};

export const NO_ADJUST: Required<Adjust> = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, tint: 0, vignette: 0, grain: 0 };

/** Every setting filled in, so two adjustments can be compared. Older projects only have the first three. */
export const fullAdjust = (a: Adjust | null | undefined): Required<Adjust> => ({ ...NO_ADJUST, ...(a ?? {}) });

const look = (brightness: number, contrast: number, saturation: number, warmth = 0, tint = 0, vignette = 0, grain = 0): Required<Adjust> => ({
  brightness,
  contrast,
  saturation,
  warmth,
  tint,
  vignette,
  grain,
});

export const ADJUST_PRESETS: { id: string; name: string; adjust: Required<Adjust> }[] = [
  { id: "original", name: "Original", adjust: NO_ADJUST },
  { id: "vivid", name: "Vivid", adjust: look(0, 15, 35) },
  { id: "warm", name: "Warm", adjust: look(6, 0, 12, 30) },
  { id: "cool", name: "Cool", adjust: look(0, 5, 0, -35) },
  { id: "golden", name: "Golden hour", adjust: look(8, 5, 15, 45, 8, 25) },
  { id: "fade", name: "Fade", adjust: look(10, -20, -20) },
  { id: "film", name: "Film", adjust: look(4, -12, -15, 15, 0, 20, 35) },
  { id: "retro", name: "Retro", adjust: look(0, -8, -25, 25, 15, 35, 25) },
  { id: "dreamy", name: "Dreamy", adjust: look(14, -18, -5, 5, 12) },
  { id: "matte", name: "Matte", adjust: look(6, -25, -10, 0, 0, 10, 10) },
  { id: "mono", name: "Mono", adjust: look(0, 10, -100) },
  { id: "noir", name: "Noir", adjust: look(0, 35, -100, 0, 0, 45, 20) },
];

export const isAdjusted = (a: Adjust | null | undefined): a is Adjust =>
  !!a && Object.values(fullAdjust(a)).some((v) => v !== 0);

/** A repeatable 0 to 1 value for a pixel, so grain looks the same on every draw instead of flickering. */
const noiseAt = (x: number, y: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Warmth, tint, vignette and grain, applied to a picture's pixels in place (RGBA, as a canvas gives them).
 * Warmth moves colours towards orange (positive) or blue; tint towards magenta (positive) or green; vignette darkens
 * the corners; grain adds film-like speckle. Each runs from -100 to 100, or 0 to 100 for vignette and grain.
 */
export const applyLook = (data: Uint8ClampedArray, width: number, height: number, a: Partial<Adjust>) => {
  const warm = (a.warmth ?? 0) * 0.35;
  const tint = (a.tint ?? 0) * 0.3;
  const vig = Math.max(0, Math.min(100, a.vignette ?? 0)) / 100;
  const grain = Math.max(0, Math.min(100, a.grain ?? 0)) * 0.5;
  if (!warm && !tint && !vig && !grain) return;
  const cx = width / 2;
  const cy = height / 2;
  const far = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = data[i] + warm + tint * 0.3;
      let g = data[i + 1] - tint;
      let b = data[i + 2] - warm + tint * 0.3;
      if (vig) {
        const d = Math.hypot(x - cx, y - cy) / far;
        const k = 1 - vig * 0.85 * Math.max(0, (d - 0.35) / 0.65) ** 2;
        r *= k;
        g *= k;
        b *= k;
      }
      if (grain) {
        const n = (noiseAt(x, y) - 0.5) * grain;
        r += n;
        g += n;
        b += n;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
};
