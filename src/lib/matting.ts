/**
 * Everything round the cut-out model except running it: turning a photo into what the network takes in, and its
 * answer into a mask. The network is U²-Net, small version, which is Apache 2.0 licensed, 4.6 MB, and takes a
 * 320 by 320 picture. How it is run is in editor/matting-runtime.ts.
 */

export const MATTE_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** Where the app serves it from. See scripts/fetch-model.mjs. */
export const MODEL_PATH = "/models/u2netp.onnx";

/**
 * The photo as the network wants it: shrunk to 320 by 320 by averaging, scaled so the brightest value is 1, then
 * centred. Laid out as three planes, red then green then blue.
 */
export function matteInput(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const S = MATTE_SIZE;
  const out = new Float32Array(3 * S * S);
  let max = 1e-6;
  for (let ty = 0; ty < S; ty++) {
    const y0 = Math.floor((ty * h) / S);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * h) / S));
    for (let tx = 0; tx < S; tx++) {
      const x0 = Math.floor((tx * w) / S);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * w) / S));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
      }
      const o = ty * S + tx;
      out[o] = r / n / 255;
      out[S * S + o] = g / n / 255;
      out[2 * S * S + o] = b / n / 255;
      max = Math.max(max, out[o], out[S * S + o], out[2 * S * S + o]);
    }
  }
  for (let c = 0; c < 3; c++) for (let i = 0; i < S * S; i++) out[c * S * S + i] = (out[c * S * S + i] / max - MEAN[c]) / STD[c];
  return out;
}

/** The share of the answer, between 0 and 1, where the object starts to show. */
export const strengthToStart = (strength: number) => 0.25 + (Math.min(100, Math.max(0, strength)) - 50) * 0.004;

/**
 * The network's 320 by 320 answer, stretched to the photo's size, as a mask from 0 to 255. strength (0 to 100,
 * 50 is usual) moves the line between object and background: lower keeps more, higher cuts closer.
 */
export function matteOutput(pred: ArrayLike<number>, w: number, h: number, strength = 50): Uint8ClampedArray {
  const S = MATTE_SIZE;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < S * S; i++) {
    lo = Math.min(lo, pred[i]);
    hi = Math.max(hi, pred[i]);
  }
  const span = hi - lo || 1;
  const at = (x: number, y: number) => (pred[Math.min(S - 1, Math.max(0, y)) * S + Math.min(S - 1, Math.max(0, x))] - lo) / span;
  const start = strengthToStart(strength);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fy = ((y + 0.5) * S) / h - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = ((x + 0.5) * S) / w - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const p = at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
      const t = Math.min(1, Math.max(0, (p - start) / 0.5));
      out[y * w + x] = Math.round(t * t * (3 - 2 * t) * 255);
    }
  }
  return out;
}
