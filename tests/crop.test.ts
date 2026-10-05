import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cropFromView, MAX_ZOOM, photoAspect, viewFromCrop } from "@/lib/crop";
import { DocSchema, type Element } from "@/lib/doc";
import { coverCrop } from "@/lib/geometry";

const ASPECTS = [0.2, 0.5, 0.75, 1, 1.333, 2, 5];
const BOXES: [number, number][] = [[1080, 1350], [1080, 1080], [950, 529], [454, 481], [300, 1200], [1200, 240]];
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
const el = (over: Partial<Element>): Pick<Element, "w" | "h" | "crop"> => ({ w: 400, h: 300, ...over });

describe("photoAspect", () => {
  it("a photo with no crop fills its frame, so it has the frame's shape", () => {
    assert.ok(near(photoAspect(el({})), 4 / 3));
  });
  it("works back from the crop to the photo's own shape", () => {
    assert.ok(near(photoAspect(el({ crop: { x: 0, y: 0, w: 0.5, h: 1 } })), (4 / 3) * 2));
    assert.ok(near(photoAspect(el({ crop: { x: 0.1, y: 0.2, w: 1, h: 0.5 } })), (4 / 3) * 0.5));
  });
  it("gets back the shape the crop was made from, for every photo and frame", () => {
    for (const a of ASPECTS) for (const [w, h] of BOXES) {
      const crop = cropFromView(a, w, h, { zoom: 2.5, x: 0.3, y: 0.7 });
      assert.ok(near(photoAspect({ w, h, crop }), a, a * 1e-9), `${a} in ${w}x${h}`);
    }
  });
});

describe("cropFromView", () => {
  it("at zoom 1 it is the largest crop that fits the frame, centred", () => {
    for (const a of ASPECTS) for (const [w, h] of BOXES) {
      const c = cropFromView(a, w, h, { zoom: 1, x: 0.5, y: 0.5 });
      const want = coverCrop(a * 1000, 1000, w, h);
      for (const k of ["x", "y", "w", "h"] as const) assert.ok(near(c[k], want[k]), `${a} ${w}x${h} ${k}`);
    }
  });

  it("never squashes the photo, never leaves it, and is always a valid crop, at every zoom and position", () => {
    for (const a of ASPECTS) for (const [w, h] of BOXES) for (const zoom of [1, 1.5, 2, 3, 4]) for (const x of [0, 0.25, 0.5, 1]) for (const y of [0, 0.5, 0.9, 1]) {
      const c = cropFromView(a, w, h, { zoom, x, y });
      const label = `${a} ${w}x${h} zoom ${zoom} at ${x},${y}`;
      assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1 + 1e-9 && c.y + c.h <= 1 + 1e-9, label);
      assert.ok(near((c.w * a) / c.h / (w / h), 1, 1e-9), `${label} is squashed`);
      assert.ok(DocSchema.safeParse({ v: 1, background: { type: "color", value: "#ffffff" }, elements: [{ id: "a", type: "image", x: 0, y: 0, w, h, rotation: 0, locked: false, crop: c }] }).success, label);
    }
  });

  it("zoom shrinks the part that shows by exactly that much", () => {
    const one = cropFromView(1.5, 1080, 1350, { zoom: 1, x: 0.5, y: 0.5 });
    for (const zoom of [2, 3, 4]) {
      const c = cropFromView(1.5, 1080, 1350, { zoom, x: 0.5, y: 0.5 });
      assert.ok(near(c.w * zoom, one.w) && near(c.h * zoom, one.h));
    }
  });

  it("zoom is held between 1 and the most", () => {
    assert.deepEqual(cropFromView(1, 100, 100, { zoom: 0.2, x: 0.5, y: 0.5 }), cropFromView(1, 100, 100, { zoom: 1, x: 0.5, y: 0.5 }));
    assert.deepEqual(cropFromView(1, 100, 100, { zoom: 99, x: 0.5, y: 0.5 }), cropFromView(1, 100, 100, { zoom: MAX_ZOOM, x: 0.5, y: 0.5 }));
  });

  it("moving the view to either side reaches the photo's edge and stops there", () => {
    const left = cropFromView(2, 400, 400, { zoom: 2, x: 0, y: 0.5 });
    const right = cropFromView(2, 400, 400, { zoom: 2, x: 1, y: 0.5 });
    assert.equal(left.x, 0);
    assert.ok(near(right.x + right.w, 1));
    const top = cropFromView(0.5, 400, 400, { zoom: 2, x: 0.5, y: 0 });
    const bottom = cropFromView(0.5, 400, 400, { zoom: 2, x: 0.5, y: 1 });
    assert.equal(top.y, 0);
    assert.ok(near(bottom.y + bottom.h, 1));
  });

  it("a photo the same shape as its frame can't be moved until zoomed in", () => {
    const a = cropFromView(1.25, 1000, 800, { zoom: 1, x: 0, y: 1 });
    const b = cropFromView(1.25, 1000, 800, { zoom: 1, x: 1, y: 0 });
    assert.deepEqual(a, b);
    assert.deepEqual(a, { x: 0, y: 0, w: 1, h: 1 });
  });
});

describe("viewFromCrop", () => {
  it("no crop is the whole photo filling the frame", () => {
    assert.deepEqual(viewFromCrop(1.5, 100, 100, undefined), { zoom: 1, x: 0.5, y: 0.5 });
  });
  it("reads back a crop made from a view, and the same crop comes out again", () => {
    for (const a of ASPECTS) for (const [w, h] of BOXES) for (const zoom of [1, 2, 4]) for (const x of [0, 0.4, 1]) for (const y of [0, 0.6, 1]) {
      const c = cropFromView(a, w, h, { zoom, x, y });
      const view = viewFromCrop(a, w, h, c);
      const again = cropFromView(a, w, h, view);
      for (const k of ["x", "y", "w", "h"] as const) assert.ok(near(again[k], c[k], 1e-9), `${a} ${w}x${h} zoom ${zoom} ${x},${y} ${k}`);
      assert.ok(near(view.zoom, zoom, 1e-9));
    }
  });
  it("a crop that is zoomed out further than a fill is read as a fill, and one zoomed past the most as the most", () => {
    assert.equal(viewFromCrop(1, 100, 100, { x: 0, y: 0, w: 1, h: 1 }).zoom, 1);
    assert.equal(viewFromCrop(1, 100, 100, { x: 0.4, y: 0.4, w: 0.05, h: 0.05 }).zoom, MAX_ZOOM);
  });
});
