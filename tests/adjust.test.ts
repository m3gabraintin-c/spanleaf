import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADJUST_PRESETS, adjustPixels, isAdjusted, NO_ADJUST } from "@/lib/adjust";
import { DocSchema } from "@/lib/doc";
import type { Adjust } from "@/lib/look";

const px = (...v: number[]) => new Uint8ClampedArray(v);
const run = (data: number[], a: Partial<Adjust>) => {
  const d = px(...data);
  adjustPixels(d, { ...NO_ADJUST, ...a });
  return [...d];
};
const sample = [0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 200, 40, 90, 255, 10, 220, 130, 77, 33, 66, 99, 0];
const doc = (adjust: unknown) => ({ v: 1 as const, background: { type: "color" as const, value: "#ffffff" }, elements: [{ id: "a", type: "image", x: 0, y: 0, w: 10, h: 10, rotation: 0, locked: false, adjust }] as never });

describe("adjustPixels", () => {
  it("changes nothing when every control is 0", () => {
    assert.deepEqual(run(sample, {}), sample);
  });

  it("never touches transparency", () => {
    for (const a of [{ brightness: 80 }, { contrast: -100 }, { saturation: 100 }, { warmth: -100 }, { brightness: -100, contrast: 100, saturation: -100, warmth: 100 }]) {
      const out = run(sample, a);
      for (let i = 3; i < out.length; i += 4) assert.equal(out[i], sample[i], JSON.stringify(a));
    }
  });

  it("brightness lifts or darkens every channel by the same amount, and stops at black and white", () => {
    assert.deepEqual(run([100, 120, 140, 255], { brightness: 20 }), [151, 171, 191, 255]);
    assert.deepEqual(run([100, 120, 140, 255], { brightness: -20 }), [49, 69, 89, 255]);
    assert.deepEqual(run([250, 250, 250, 255], { brightness: 100 }), [255, 255, 255, 255]);
    assert.deepEqual(run([5, 5, 5, 255], { brightness: -100 }), [0, 0, 0, 255]);
  });

  it("brighter is never darker, across the whole range", () => {
    for (let v = 0; v <= 255; v += 5) {
      let last = -1;
      for (let b = -100; b <= 100; b += 10) {
        const out = run([v, v, v, 255], { brightness: b })[0];
        assert.ok(out >= last, `v ${v} b ${b}`);
        last = out;
      }
    }
  });

  it("contrast pushes away from mid grey and leaves mid grey alone", () => {
    assert.deepEqual(run([128, 128, 128, 255], { contrast: 100 }), [128, 128, 128, 255]);
    const up = run([160, 100, 128, 255], { contrast: 50 });
    assert.ok(up[0] > 160 && up[1] < 100);
    const down = run([200, 50, 128, 255], { contrast: -50 });
    assert.ok(down[0] < 200 && down[1] > 50);
    const flat = run([200, 50, 90, 255], { contrast: -100 });
    assert.ok(Math.abs(flat[0] - 128) <= Math.abs(200 - 128) / 4, "almost flat at -100");
  });

  it("colour at -100 is grey, at 0 is as shot, and at 100 is stronger than as shot", () => {
    const [r, g, b] = run([200, 40, 90, 255], { saturation: -100 });
    assert.ok(r === g && g === b, `${r} ${g} ${b}`);
    assert.ok(Math.abs(r - (0.299 * 200 + 0.587 * 40 + 0.114 * 90)) <= 1);
    const more = run([200, 40, 90, 255], { saturation: 100 });
    assert.ok(more[0] - more[1] > 200 - 40);
    assert.deepEqual(run([90, 90, 90, 255], { saturation: 100 }), [90, 90, 90, 255], "grey has no colour to strengthen");
  });

  it("warmth adds red and takes blue, cool does the opposite, and green is untouched", () => {
    const warm = run([100, 100, 100, 255], { warmth: 40 });
    assert.deepEqual(warm, [120, 100, 80, 255]);
    const cool = run([100, 100, 100, 255], { warmth: -40 });
    assert.deepEqual(cool, [80, 100, 120, 255]);
  });

  it("the same controls on every pixel give the same result however the pixels are ordered", () => {
    const a = run([10, 20, 30, 255, 200, 190, 180, 255], { brightness: 10, contrast: 20, saturation: 30, warmth: 40 });
    const b = run([200, 190, 180, 255, 10, 20, 30, 255], { brightness: 10, contrast: 20, saturation: 30, warmth: 40 });
    assert.deepEqual([...a.slice(0, 4)], [...b.slice(4, 8)]);
    assert.deepEqual([...a.slice(4, 8)], [...b.slice(0, 4)]);
  });

  it("stays finite and in range at every extreme combination", () => {
    for (const brightness of [-100, 0, 100]) for (const contrast of [-100, 0, 100]) for (const saturation of [-100, 0, 100]) for (const warmth of [-100, 0, 100]) {
      for (const v of run(sample, { brightness, contrast, saturation, warmth })) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
    }
  });
});

describe("isAdjusted and the ready-made looks", () => {
  it("is false for nothing or all zeros, true for any change", () => {
    assert.equal(isAdjusted(undefined), false);
    assert.equal(isAdjusted(NO_ADJUST), false);
    for (const k of ["brightness", "contrast", "saturation", "warmth"] as const) assert.equal(isAdjusted({ ...NO_ADJUST, [k]: 1 }), true, k);
  });
  it("every look is a valid adjustment, they are named once, and Original changes nothing", () => {
    const ids = ADJUST_PRESETS.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(ADJUST_PRESETS.map((p) => p.name)).size, ids.length);
    assert.equal(ADJUST_PRESETS[0].id, "original");
    assert.equal(isAdjusted(ADJUST_PRESETS[0].adjust), false);
    for (const p of ADJUST_PRESETS) assert.ok(DocSchema.safeParse(doc(p.adjust)).success, p.id);
    for (const p of ADJUST_PRESETS.slice(1)) assert.ok(isAdjusted(p.adjust), p.id);
  });
  it("Mono really is black and white and Warm is warmer than Cool", () => {
    const mono = run([200, 40, 90, 255], ADJUST_PRESETS.find((p) => p.id === "mono")!.adjust);
    assert.ok(mono[0] === mono[1] && mono[1] === mono[2]);
    const warm = run([100, 100, 100, 255], ADJUST_PRESETS.find((p) => p.id === "warm")!.adjust);
    const cool = run([100, 100, 100, 255], ADJUST_PRESETS.find((p) => p.id === "cool")!.adjust);
    assert.ok(warm[0] > cool[0] && warm[2] < cool[2]);
  });
});

describe("adjust in the saved document", () => {
  it("accepts values from -100 to 100 and no adjustment at all", () => {
    assert.ok(DocSchema.safeParse(doc(undefined)).success);
    assert.ok(DocSchema.safeParse(doc({ brightness: -100, contrast: 100, saturation: 0, warmth: 55.5 })).success);
  });
  it("refuses out of range, missing or non-number values", () => {
    for (const bad of [{ ...NO_ADJUST, brightness: 101 }, { ...NO_ADJUST, warmth: -101 }, { brightness: 0, contrast: 0, saturation: 0 }, { ...NO_ADJUST, contrast: "5" }, { ...NO_ADJUST, saturation: NaN }, "vivid", 5]) {
      assert.ok(!DocSchema.safeParse(doc(bad)).success, JSON.stringify(bad));
    }
  });
});
