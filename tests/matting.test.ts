import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MATTE_SIZE, matteInput, matteOutput, MODEL_PATH, strengthToStart } from "@/lib/matting";

const S = MATTE_SIZE;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const solid = (w: number, h: number, r: number, g: number, b: number) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set([r, g, b, 255], i * 4);
  return d;
};
const close = (a: number, b: number, tol = 1e-5) => Math.abs(a - b) <= tol;

describe("matteInput", () => {
  it("is three planes of 320 by 320", () => {
    assert.equal(matteInput(solid(640, 640, 10, 20, 30), 640, 640).length, 3 * S * S);
  });

  it("a flat colour gives a flat plane for each channel, scaled so the brightest channel is 1, then centred", () => {
    const out = matteInput(solid(100, 80, 200, 100, 50), 100, 80);
    const max = 200 / 255;
    const want = [200, 100, 50].map((v, c) => (v / 255 / max - MEAN[c]) / STD[c]);
    for (let c = 0; c < 3; c++) for (const i of [0, 777, S * S - 1]) assert.ok(close(out[c * S * S + i], want[c]), `plane ${c} at ${i}`);
  });

  it("a dark photo is brightened until its brightest value is 1", () => {
    const out = matteInput(solid(64, 64, 10, 20, 5), 64, 64);
    let top = 0;
    for (let c = 0; c < 3; c++) for (let i = 0; i < S * S; i++) top = Math.max(top, out[c * S * S + i] * STD[c] + MEAN[c]);
    assert.ok(close(top, 1));
  });

  it("an all-black photo doesn't divide by zero", () => {
    const out = matteInput(solid(50, 50, 0, 0, 0), 50, 50);
    assert.ok(out.every(Number.isFinite));
  });

  it("averages the pixels each square covers: a photo half black and half white splits down the middle", () => {
    const w = 640;
    const h = 640;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(x < w / 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * w + x) * 4);
    const out = matteInput(d, w, h);
    assert.ok(close(out[100 * S + 10], (0 - MEAN[0]) / STD[0]));
    assert.ok(close(out[100 * S + 300], (1 - MEAN[0]) / STD[0]));
    assert.ok(close(out[S * S + 100 * S + 159], (0 - MEAN[1]) / STD[1]), "the last black square");
    assert.ok(close(out[S * S + 100 * S + 160], (1 - MEAN[1]) / STD[1]), "the first white square");
  });

  it("keeps red, green and blue in their own planes", () => {
    const out = matteInput(solid(32, 32, 255, 0, 0), 32, 32);
    assert.ok(out[0] > out[S * S] && out[0] > out[2 * S * S]);
  });

  it("copes with photos that don't divide into 320, tiny photos, and thin ones", () => {
    for (const [w, h] of [[700, 549], [1, 1], [3, 2], [320, 320], [321, 319], [5000, 4], [4, 5000]]) {
      const out = matteInput(solid(w, h, 90, 140, 200), w, h);
      assert.equal(out.length, 3 * S * S, `${w}x${h}`);
      assert.ok(out.every(Number.isFinite), `${w}x${h}`);
    }
  });
});

describe("matteOutput", () => {
  const ramp = () => Float32Array.from({ length: S * S }, (_, i) => (i % S) / (S - 1));
  const count = (m: Uint8ClampedArray) => m.filter((v) => v >= 128).length;

  it("is one number per pixel of the photo, from 0 to 255", () => {
    for (const [w, h] of [[700, 549], [1, 1], [1000, 3], [3, 1000], [320, 320]]) {
      const m = matteOutput(ramp(), w, h);
      assert.equal(m.length, w * h, `${w}x${h}`);
    }
  });

  it("follows the answer: dark where it is low, solid where it is high, rising across a ramp", () => {
    const m = matteOutput(ramp(), 640, 100);
    assert.equal(m[50 * 640], 0);
    assert.equal(m[50 * 640 + 639], 255);
    let last = -1;
    for (let x = 0; x < 640; x++) {
      assert.ok(m[50 * 640 + x] >= last, `x ${x}`);
      last = m[50 * 640 + x];
    }
  });

  it("finds a block the network was sure about, in the right place", () => {
    const pred = new Float32Array(S * S);
    for (let y = 100; y < 220; y++) for (let x = 80; x < 240; x++) pred[y * S + x] = 5;
    const m = matteOutput(pred, 640, 640);
    assert.equal(m[320 * 640 + 320], 255);
    assert.equal(m[10 * 640 + 10], 0);
    assert.equal(m[630 * 640 + 630], 0);
    assert.equal(m[320 * 640 + 20], 0);
  });

  it("scales the answer first, so any range of numbers works the same", () => {
    const a = matteOutput(ramp(), 128, 64);
    const b = matteOutput(Float32Array.from(ramp(), (v) => v * 40 - 7), 128, 64);
    assert.deepEqual([...a], [...b]);
  });

  it("an answer with no difference in it gives nothing, not a division by zero", () => {
    const m = matteOutput(new Float32Array(S * S).fill(0.6), 50, 50);
    assert.ok(m.every((v) => v === 0));
  });

  it("flipping the answer flips the mask", () => {
    const pred = Float32Array.from({ length: S * S }, (_, i) => ((i % S) < 100 ? 1 : 0));
    const flipped = Float32Array.from({ length: S * S }, (_, i) => pred[(Math.floor(i / S) + 1) * S - 1 - (i % S)]);
    const m = matteOutput(pred, 320, 40);
    const f = matteOutput(flipped, 320, 40);
    for (let x = 0; x < 320; x++) assert.ok(Math.abs(m[20 * 320 + x] - f[20 * 320 + (319 - x)]) <= 1, `x ${x}`);
  });

  it("a higher strength keeps less, step by step, and a lower one keeps more", () => {
    const counts = [0, 25, 50, 75, 100].map((s) => count(matteOutput(ramp(), 320, 20, s)));
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] < counts[i - 1], `${counts}`);
  });

  it("strength 50 is the usual setting, and strength outside 0 to 100 is held to the ends", () => {
    assert.equal(strengthToStart(50), 0.25);
    assert.ok(close(strengthToStart(0), 0.05) && close(strengthToStart(100), 0.45));
    assert.equal(strengthToStart(-40), strengthToStart(0));
    assert.equal(strengthToStart(500), strengthToStart(100));
    assert.deepEqual([...matteOutput(ramp(), 40, 10)], [...matteOutput(ramp(), 40, 10, 50)]);
  });

  it("edges are soft: between solid and clear there are in-between values", () => {
    const m = matteOutput(ramp(), 640, 10);
    assert.ok(m.some((v) => v > 20 && v < 235));
  });
});

describe("where the model lives", () => {
  it("is served from the app's own address", () => {
    assert.equal(MODEL_PATH, "/models/u2netp.onnx");
  });
});
