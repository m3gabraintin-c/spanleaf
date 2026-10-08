import { Rgba, composeSticker, dropSpecks, keptShare, matteInput, matteMask, squaredDistance } from "./cutout";

const S = 320;

describe("matteInput", () => {
  it("is three planes of 320 by 320 with finite values, for any picture size", () => {
    for (const [w, h] of [
      [1, 1],
      [640, 480],
      [321, 1000],
    ]) {
      const img: Rgba = { data: new Uint8ClampedArray(w * h * 4).fill(120), w, h };
      const out = matteInput(img);
      expect(out.length).toBe(3 * S * S);
      expect(out.every(Number.isFinite)).toBe(true);
    }
  });
});

describe("matteMask", () => {
  const block = () => {
    const pred = new Float32Array(S * S);
    for (let y = 100; y < 220; y++) for (let x = 80; x < 240; x++) pred[y * S + x] = 5;
    return pred;
  };
  it("keeps where the network is sure and clears elsewhere, at the picture's size", () => {
    const m = matteMask(block(), 640, 640);
    expect(m.length).toBe(640 * 640);
    expect(m[320 * 640 + 320]).toBe(255);
    expect(m[10 * 640 + 10]).toBe(0);
  });
  it("cuts closer as the strength goes up", () => {
    const ramp = Float32Array.from({ length: S * S }, (_, i) => (i % S) / (S - 1));
    const counts = [0, 50, 100].map((s) => keptShare(matteMask(ramp, 320, 20, s)));
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
  });
});

describe("dropSpecks", () => {
  it("removes a small speck far from the subject and keeps the subject", () => {
    const w = 100;
    const m = new Uint8ClampedArray(w * w);
    for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) m[y * w + x] = 255;
    for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) m[y * w + x] = 255;
    const out = dropSpecks(m, w, w);
    expect(out[50 * w + 50]).toBe(255);
    expect(out[3 * w + 3]).toBe(0);
  });
});

describe("squaredDistance", () => {
  it("is 0 on the set and grows away from it", () => {
    const on = new Uint8Array(20 * 20);
    on[10 * 20 + 10] = 1;
    const d = squaredDistance(on, 20, 20);
    expect(d[10 * 20 + 10]).toBe(0);
    expect(d[10 * 20 + 13]).toBe(9);
    expect(d[13 * 20 + 14]).toBe(25);
  });
});

describe("composeSticker", () => {
  const img: Rgba = { data: Uint8ClampedArray.from({ length: 60 * 40 * 4 }, (_, i) => (i % 4 === 3 ? 255 : 200)), w: 60, h: 40 };
  const disc = () => {
    const m = new Uint8ClampedArray(60 * 40);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) m[y * 60 + x] = Math.hypot(x - 30, y - 20) <= 12 ? 255 : 0;
    return m;
  };
  it("trims to the subject and makes the rest see-through", () => {
    const out = composeSticker(img, disc(), null)!;
    expect(out.w).toBeLessThanOrEqual(26);
    expect(out.h).toBeLessThanOrEqual(26);
    expect(out.data[(Math.floor(out.h / 2) * out.w + Math.floor(out.w / 2)) * 4 + 3]).toBe(255);
    expect(out.data[3]).toBe(0);
  });
  it("a border makes the sticker bigger by about twice its width, in the border colour at the edge", () => {
    const plain = composeSticker(img, disc(), null)!;
    const bordered = composeSticker(img, disc(), { width: 6, color: "#ff0000" })!;
    expect(bordered.w - plain.w).toBeGreaterThanOrEqual(10);
    expect(bordered.w - plain.w).toBeLessThanOrEqual(14);
    const midRow = Math.floor(bordered.h / 2);
    const edge = (midRow * bordered.w + 2) * 4;
    expect(bordered.data[edge]).toBe(255);
    expect(bordered.data[edge + 1]).toBe(0);
  });
  it("is nothing when the mask is empty", () => {
    expect(composeSticker(img, new Uint8ClampedArray(60 * 40), { width: 6, color: "#ffffff" })).toBeNull();
  });
});
