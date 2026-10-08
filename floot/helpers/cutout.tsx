/**
 * Cut-out: finds the main subject of a picture and makes everything else see-through, so it can be used as a
 * sticker. It runs in the browser with a small open model (U²-Net small, Apache 2.0 licence) on ONNX Runtime
 * Web (MIT licence). The picture never leaves the device. The model (4.6 MB) is served from this app and the
 * runtime (about 2.5 MB) from jsDelivr, each downloaded once and then cached by the browser.
 */

const ORT_VERSION = "1.22.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_URL = "/_cdn/static/models/u2netp.onnx";
const S = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
/** The longest side the picture is worked on at. */
const WORK_EDGE = 1024;

type Ort = {
  env: { wasm: { wasmPaths: string; numThreads: number; proxy: boolean } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create: (url: string, o: { executionProviders: string[] }) => Promise<Session> };
};
type Session = { inputNames: string[]; outputNames: string[]; run: (f: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> };

let loading: Promise<{ ort: Ort; session: Session }> | null = null;

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("The cut-out tool couldn't be downloaded. Check your connection."));
    document.head.appendChild(s);
  });

/** Loads the runtime and the model the first time they are needed. A failure isn't remembered, so it can be retried. */
const loadModel = () => {
  loading ??= (async () => {
    const w = window as unknown as { ort?: Ort };
    if (!w.ort) await loadScript(`${ORT_BASE}ort.wasm.min.js`);
    const ort = w.ort!;
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
    return { ort, session };
  })();
  loading.catch(() => (loading = null));
  return loading;
};

export type Rgba = { data: Uint8ClampedArray; w: number; h: number };

/** Reads a picture into pixels, at most WORK_EDGE on its longest side. */
const readPixels = (src: string): Promise<Rgba> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const k = Math.min(1, WORK_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ data: ctx.getImageData(0, 0, w, h).data, w, h });
    };
    img.onerror = () => reject(new Error("That picture couldn't be opened."));
    img.src = src;
  });

/** The picture as the network wants it: 320 by 320, scaled so the brightest value is 1, then centred. */
export const matteInput = (img: Rgba): Float32Array => {
  const out = new Float32Array(3 * S * S);
  let max = 1e-6;
  for (let ty = 0; ty < S; ty++) {
    const y0 = Math.floor((ty * img.h) / S);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * img.h) / S));
    for (let tx = 0; tx < S; tx++) {
      const x0 = Math.floor((tx * img.w) / S);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * img.w) / S));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.w + x) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
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
};

/**
 * The network's answer stretched to the picture's size, as a mask from 0 to 255. strength (0 to 100, 50 usual)
 * moves the line between subject and background: higher cuts closer.
 */
export const matteMask = (pred: ArrayLike<number>, w: number, h: number, strength = 50): Uint8ClampedArray => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < S * S; i++) {
    lo = Math.min(lo, pred[i]);
    hi = Math.max(hi, pred[i]);
  }
  const span = hi - lo || 1;
  const at = (x: number, y: number) => (pred[Math.min(S - 1, Math.max(0, y)) * S + Math.min(S - 1, Math.max(0, x))] - lo) / span;
  const start = 0.25 + (Math.min(100, Math.max(0, strength)) - 50) * 0.004;
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
};

/** Removes pieces of the mask much smaller than the main one, so stray specks don't become part of the sticker. */
export const dropSpecks = (mask: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray => {
  const label = new Int32Array(w * h);
  const sizes = [0];
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (mask[start] < 128 || label[start]) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    label[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) {
        if (j >= 0 && mask[j] >= 128 && !label[j]) {
          label[j] = id;
          queue[tail++] = j;
        }
      }
    }
    sizes.push(tail);
  }
  const least = Math.max(20, Math.max(0, ...sizes) * 0.06);
  const out = new Uint8ClampedArray(mask);
  for (let i = 0; i < w * h; i++) {
    if (label[i] && sizes[label[i]] < least) out[i] = 0;
  }
  return out;
};

/** For every pixel, the squared distance to the nearest pixel that is on (Felzenszwalb and Huttenlocher). */
export const squaredDistance = (on: Uint8Array, w: number, h: number): Float32Array => {
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
};

/**
 * The subject cut out, with an optional die-cut border round it, trimmed to the subject. Returns null when the
 * mask is empty.
 */
export const composeSticker = (img: Rgba, mask: Uint8ClampedArray, outline: { width: number; color: string } | null): Rgba | null => {
  const pad = outline ? Math.ceil(outline.width) + 2 : 0;
  const W = img.w + pad * 2;
  const H = img.h + pad * 2;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      const o = ((y + pad) * W + x + pad) * 4;
      data[o] = img.data[i];
      data[o + 1] = img.data[i + 1];
      data[o + 2] = img.data[i + 2];
      data[o + 3] = Math.round((img.data[i + 3] * mask[y * img.w + x]) / 255);
    }
  }
  if (outline) {
    const on = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) on[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
    const d2 = squaredDistance(on, W, H);
    const n = parseInt(outline.color.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (let i = 0; i < W * H; i++) {
      const border = Math.min(1, Math.max(0, outline.width + 0.5 - Math.sqrt(d2[i])));
      const sa = data[i * 4 + 3] / 255;
      const a = sa + border * (1 - sa);
      if (a === 0) continue;
      const under = (border * (1 - sa)) / a;
      const over = sa / a;
      data[i * 4] = data[i * 4] * over + r * under;
      data[i * 4 + 1] = data[i * 4 + 1] * over + g * under;
      data[i * 4 + 2] = data[i * 4 + 2] * over + b * under;
      data[i * 4 + 3] = a * 255;
    }
  }
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] >= 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
  return { data: out, w, h };
};

/** A picture's pixels as a PNG address. */
export const toPng = (img: Rgba): string => {
  const c = document.createElement("canvas");
  c.width = img.w;
  c.height = img.h;
  const ctx = c.getContext("2d")!;
  const px = ctx.createImageData(img.w, img.h);
  px.data.set(img.data);
  ctx.putImageData(px, 0, 0);
  return c.toDataURL("image/png");
};

export type Matte = { img: Rgba; pred: Float32Array };

/** Runs the model on a picture. Keep the result: different strengths and borders reuse it without running again. */
export const findSubject = async (src: string): Promise<Matte> => {
  const [img, { ort, session }] = await Promise.all([readPixels(src), loadModel()]);
  const input = new ort.Tensor("float32", matteInput(img), [1, 3, S, S]);
  const out = await session.run({ [session.inputNames[0]]: input });
  return { img, pred: out[session.outputNames[0]].data };
};

/** The share of the picture kept as the subject, 0 to 1. */
export const keptShare = (mask: Uint8ClampedArray) => {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) n++;
  return n / mask.length;
};
