import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_ADJUST } from "@/lib/adjust";
import { ADJUST_EDGE, adjustedSource } from "@/editor/adjusted";

/** A stand-in canvas that records what is done to it, so the copy-and-cache logic runs without a browser. */
function fakes(natural: { w: number; h: number }, pixels: number[] = [100, 100, 100, 255]) {
  const img = { naturalWidth: natural.w, naturalHeight: natural.h } as HTMLImageElement;
  const made: { width: number; height: number; drawn: unknown[][]; put: Uint8ClampedArray[] }[] = [];
  const make = () => {
    const c = {
      width: 0,
      height: 0,
      drawn: [] as unknown[][],
      put: [] as Uint8ClampedArray[],
      getContext: () => ({
        drawImage: (...a: unknown[]) => c.drawn.push(a),
        getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
        putImageData: (d: { data: Uint8ClampedArray }) => c.put.push(d.data),
      }),
    };
    made.push(c);
    return c as unknown as HTMLCanvasElement;
  };
  return { img, made, make };
}

describe("adjustedSource", () => {
  it("gives back the photo itself when nothing is changed, and makes no copy", () => {
    const { img, made, make } = fakes({ w: 800, h: 600 });
    assert.equal(adjustedSource(img, undefined, make), img);
    assert.equal(adjustedSource(img, NO_ADJUST, make), img);
    assert.equal(made.length, 0);
  });

  it("copies a changed photo to a canvas, applies the change to its pixels, and puts them back", () => {
    const { img, made, make } = fakes({ w: 800, h: 600 });
    const out = adjustedSource(img, { ...NO_ADJUST, brightness: 20 }, make) as unknown as (typeof made)[number];
    assert.equal(out, made[0]);
    assert.equal(out.drawn.length, 1);
    assert.deepEqual(out.drawn[0], [img, 0, 0, 800, 600]);
    assert.deepEqual([...out.put[0]], [151, 151, 151, 255]);
  });

  it("makes a big photo smaller, keeping its shape, and never makes a small one bigger", () => {
    const big = fakes({ w: 4000, h: 3000 });
    const c = adjustedSource(big.img, { ...NO_ADJUST, contrast: 10 }, big.make) as unknown as { width: number; height: number };
    assert.equal(c.width, ADJUST_EDGE);
    assert.equal(c.height, 1200);
    const tall = fakes({ w: 3000, h: 4000 });
    const t = adjustedSource(tall.img, { ...NO_ADJUST, contrast: 10 }, tall.make) as unknown as { width: number; height: number };
    assert.deepEqual([t.width, t.height], [1200, ADJUST_EDGE]);
    const small = fakes({ w: 300, h: 200 });
    const s = adjustedSource(small.img, { ...NO_ADJUST, contrast: 10 }, small.make) as unknown as { width: number; height: number };
    assert.deepEqual([s.width, s.height], [300, 200]);
    const sliver = fakes({ w: 8000, h: 1 });
    const v = adjustedSource(sliver.img, { ...NO_ADJUST, contrast: 10 }, sliver.make) as unknown as { width: number; height: number };
    assert.deepEqual([v.width, v.height], [ADJUST_EDGE, 1], "never a zero-size canvas");
  });

  it("remembers a copy: the same change on the same photo is the same canvas, made once", () => {
    const { img, made, make } = fakes({ w: 800, h: 600 });
    const a = adjustedSource(img, { ...NO_ADJUST, saturation: 30 }, make);
    const b = adjustedSource(img, { ...NO_ADJUST, saturation: 30 }, make);
    assert.equal(a, b);
    assert.equal(made.length, 1);
  });

  it("a different change, or a different photo, gets its own copy", () => {
    const one = fakes({ w: 800, h: 600 });
    const a = adjustedSource(one.img, { ...NO_ADJUST, saturation: 30 }, one.make);
    const b = adjustedSource(one.img, { ...NO_ADJUST, saturation: 31 }, one.make);
    assert.notEqual(a, b);
    const two = fakes({ w: 800, h: 600 });
    assert.notEqual(adjustedSource(two.img, { ...NO_ADJUST, saturation: 30 }, two.make), a);
  });

  it("keeps only the last four changes of a photo, so a slider doesn't pile up copies, and the one used most recently survives", () => {
    const { img, made, make } = fakes({ w: 800, h: 600 });
    const at = (n: number) => adjustedSource(img, { ...NO_ADJUST, brightness: n }, make);
    const first = at(1);
    at(2);
    at(3);
    at(4);
    assert.equal(at(1), first, "touching 1 again makes it the newest");
    at(5); // drops the oldest, which is now 2
    assert.equal(made.length, 5);
    assert.equal(at(1), first, "1 is still remembered");
    at(2);
    assert.equal(made.length, 6, "2 was dropped and had to be made again");
  });
});
