import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { DocSchema, type Element } from "@/lib/doc";
import { coverCrop, maskPolygon, sourceRect } from "@/lib/geometry";
import { patchProjectInput } from "@/server/schemas";
import { useEditor } from "@/editor/store";
import { drawMaskedImage, drawPattern } from "@/editor/draw";
import type { Project } from "@/data/types";

const base = { id: "a", type: "image", x: 0, y: 0, w: 400, h: 500, rotation: 0, locked: false };
const doc = (elements: unknown[], extra: Record<string, unknown> = {}) => ({ v: 1 as const, background: { type: "color" as const, value: "#ffffff" }, elements: elements as never, ...extra });
const styled = {
  ...base,
  crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 },
  mask: { shape: "torn", seed: 7 },
  outline: { color: "#ffffff", width: 12 },
  shadow: { color: "#000000", blur: 20, x: 4, y: 8, opacity: 0.3 },
  opacity: 0.9,
};
const pattern = { kind: "grid", color: "#e5e5e5", size: 60, thickness: 1 };

describe("collage fields in the saved document", () => {
  it("a document saved before these fields existed parses unchanged", () => {
    const old = doc([base]);
    assert.deepEqual(DocSchema.parse(old), old);
  });
  it("crop, mask, outline, shadow, opacity and pattern all survive a parse", () => {
    const parsed = DocSchema.parse(doc([styled], { pattern }));
    assert.deepEqual(parsed.elements[0], styled);
    assert.deepEqual(parsed.pattern, pattern);
  });
  it("the route's request schema accepts them too", () => {
    assert.ok(patchProjectInput.safeParse({ rev: 0, doc: doc([styled], { pattern }) }).success);
  });
  it("refuses a crop that is empty or runs past the photo", () => {
    for (const crop of [{ x: 0, y: 0, w: 0, h: 1 }, { x: 0.6, y: 0, w: 0.6, h: 1 }, { x: 0, y: 0.5, w: 1, h: 0.6 }, { x: -0.1, y: 0, w: 1, h: 1 }]) {
      assert.ok(!DocSchema.safeParse(doc([{ ...base, crop }])).success, JSON.stringify(crop));
    }
    assert.ok(DocSchema.safeParse(doc([{ ...base, crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }])).success);
  });
  it("refuses bad masks, outlines, shadows, opacity and patterns", () => {
    const bad: Record<string, unknown>[] = [
      { mask: { shape: "star" } },
      { mask: { shape: "rounded", radius: 0.9 } },
      { mask: { shape: "torn", seed: 1.5 } },
      { outline: { color: "white", width: 5 } },
      { outline: { color: "#ffffff", width: -1 } },
      { shadow: { color: "#000000", blur: 10, x: 0, y: 0, opacity: 2 } },
      { opacity: -0.1 },
      { opacity: 1.1 },
    ];
    for (const over of bad) assert.ok(!DocSchema.safeParse(doc([{ ...base, ...over }])).success, JSON.stringify(over));
    for (const p of [{ ...pattern, kind: "stripes" }, { ...pattern, size: 2 }, { ...pattern, color: "grey" }, { ...pattern, thickness: 0 }]) {
      assert.ok(!DocSchema.safeParse(doc([base], { pattern: p })).success, JSON.stringify(p));
    }
  });
  it("unknown fields inside the new objects are dropped, not stored", () => {
    const parsed = DocSchema.parse(doc([{ ...base, mask: { shape: "rect", url: "https://evil.test" } }], { pattern: { ...pattern, script: "x" } }));
    assert.ok(!JSON.stringify(parsed).includes("evil.test"));
    assert.ok(!("script" in (parsed.pattern as object)));
  });
  it("500 fully styled elements stay well under the 2 MB limit", () => {
    const big = doc(Array.from({ length: 500 }, () => ({ ...styled, name: "x".repeat(200) })), { pattern });
    assert.ok(JSON.stringify(big).length < 600 * 1024);
  });
});

describe("mask shapes", () => {
  const inBox = (pts: number[], w: number, h: number) => pts.every((v, i) => v >= -1e-9 && v <= (i % 2 === 0 ? w : h) + 1e-9);
  it("a rect is its four corners", () => {
    assert.deepEqual(maskPolygon("rect", 300, 200), [0, 0, 300, 0, 300, 200, 0, 200]);
  });
  it("every shape stays inside its own box, so the photo always covers it", () => {
    for (const shape of ["rect", "rounded", "ellipse", "torn"] as const) {
      for (const [w, h] of [[400, 500], [1080, 90], [60, 60]]) {
        const pts = maskPolygon(shape, w, h, { seed: 3 });
        assert.ok(pts.length >= 8 && pts.length % 2 === 0, shape);
        assert.ok(inBox(pts, w, h), `${shape} ${w}x${h}`);
      }
    }
  });
  it("a torn edge is the same for the same seed and different for another", () => {
    const a = maskPolygon("torn", 400, 500, { seed: 5 });
    assert.deepEqual(a, maskPolygon("torn", 400, 500, { seed: 5 }));
    assert.notDeepEqual(a, maskPolygon("torn", 400, 500, { seed: 6 }));
    assert.deepEqual(a.slice(0, 2), [0, 0]);
  });
  it("a torn edge with no seed given is the same as seed 1", () => {
    assert.deepEqual(maskPolygon("torn", 300, 400), maskPolygon("torn", 300, 400, { seed: 1 }));
  });
  it("rounded with radius 0 is a plain rectangle", () => {
    assert.deepEqual(maskPolygon("rounded", 300, 200, { radius: 0 }), [0, 0, 300, 0, 300, 200, 0, 200]);
  });
});

describe("cover crop", () => {
  const shapeOf = (c: { w: number; h: number }, iw: number, ih: number) => (c.w * iw) / (c.h * ih);
  it("fills the box without squashing, for wide, tall and matching photos", () => {
    for (const [iw, ih] of [[4000, 3000], [3000, 4000], [1000, 1250]]) {
      const c = coverCrop(iw, ih, 400, 500);
      assert.ok(Math.abs(shapeOf(c, iw, ih) - 400 / 500) < 1e-9, `${iw}x${ih}`);
      assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1 + 1e-9 && c.y + c.h <= 1 + 1e-9);
    }
    assert.deepEqual(coverCrop(1000, 1250, 400, 500), { x: 0, y: 0, w: 1, h: 1 });
  });
  it("follows the focus point but never leaves the photo", () => {
    const left = coverCrop(4000, 3000, 500, 500, { x: 0, y: 0.5 });
    const right = coverCrop(4000, 3000, 500, 500, { x: 1, y: 0.5 });
    assert.equal(left.x, 0);
    assert.ok(Math.abs(right.x + right.w - 1) < 1e-9);
  });
  it("a result is always a valid crop in the document schema", () => {
    assert.ok(DocSchema.safeParse(doc([{ ...base, crop: coverCrop(4032, 3024, 1080, 1350, { x: 0.3, y: 0.4 }) }])).success);
  });
  it("sourceRect gives pixels, and the whole photo with no crop", () => {
    assert.deepEqual(sourceRect(undefined, 800, 600), { sx: 0, sy: 0, sw: 800, sh: 600 });
    assert.deepEqual(sourceRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 800, 600), { sx: 200, sy: 300, sw: 400, sh: 300 });
  });
});

describe("editor store: pattern", () => {
  const S = () => useEditor.getState();
  const project = (): Project => ({ id: "p1", title: "T", format: "square", slideCount: 3, rev: 0, updatedAt: new Date().toISOString(), doc: { v: 1, background: { type: "color", value: "#ffffff" }, elements: [] } });
  beforeEach(() => S().load(project()));
  const p = { kind: "grid" as const, color: "#dddddd", size: 40, thickness: 1 };

  it("sets, undoes, redoes and removes a pattern", () => {
    S().setPattern(p);
    assert.deepEqual(S().doc.pattern, p);
    assert.equal(S().saveStatus, "unsaved");
    S().undo();
    assert.equal(S().doc.pattern, undefined);
    S().redo();
    assert.deepEqual(S().doc.pattern, p);
    S().setPattern(null);
    assert.ok(!("pattern" in S().doc));
  });
  it("changing the background re-tints the pattern with it, as one undo step", () => {
    S().setPattern({ kind: "dots", color: "#aaaaaa", size: 99, thickness: 3 });
    S().setBackground("#101010");
    assert.equal(S().doc.pattern?.kind, "dots");
    assert.notEqual(S().doc.pattern?.color, "#aaaaaa");
    assert.equal(S().doc.pattern?.size, 40, "back to the dots' usual spacing");
    S().undo();
    assert.equal(S().doc.background.value, "#ffffff");
    assert.equal(S().doc.pattern?.color, "#aaaaaa");
  });
  it("with no pattern, changing the background adds none", () => {
    S().setBackground("#101010");
    assert.equal(S().doc.pattern, undefined);
  });
  it("setting the same pattern again is not an undo step", () => {
    S().setPattern(p);
    const before = S().past.length;
    S().setPattern({ ...p });
    assert.equal(S().past.length, before);
  });
  it("a duplicated photo keeps its crop, mask, outline and shadow", () => {
    const e: Element = { ...base, ...styled, type: "image" } as Element;
    S().addElement(e);
    const id = S().duplicateElement("a");
    const copy = S().doc.elements.find((x) => x.id === id)!;
    assert.deepEqual(copy.crop, e.crop);
    assert.deepEqual(copy.mask, e.mask);
    assert.deepEqual(copy.outline, e.outline);
    assert.deepEqual(copy.shadow, e.shadow);
  });
});

/** Records the canvas calls, so drawing can be checked without a browser. */
function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => (...args: unknown[]) => void calls.push([name, ...args]),
    set: (_t, name: string, v) => ((props[name] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, props };
}
const names = (calls: [string, ...unknown[]][]) => calls.map((c) => c[0]);

describe("drawing", () => {
  const img = { naturalWidth: 2000, naturalHeight: 1000 } as HTMLImageElement;
  it("draws the cropped part of the photo into the element's box, inside a clip", () => {
    const { ctx, calls } = recorder();
    drawMaskedImage(ctx, img, { ...base, w: 400, h: 500, mask: { shape: "ellipse" }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } } as Element);
    const n = names(calls);
    assert.ok(n.indexOf("clip") !== -1 && n.indexOf("clip") < n.indexOf("drawImage"));
    assert.deepEqual(calls.find((c) => c[0] === "drawImage"), ["drawImage", img, 500, 0, 1000, 1000, 0, 0, 400, 500]);
    assert.equal(n.filter((x) => x === "save").length, n.filter((x) => x === "restore").length);
  });
  it("an outline is stroked twice as wide as asked, with the shape's own colour, before the photo", () => {
    const { ctx, calls, props } = recorder();
    drawMaskedImage(ctx, img, { ...base, mask: { shape: "rounded" }, outline: { color: "#ffffff", width: 10 } } as Element);
    assert.equal(props.lineWidth, 20);
    assert.equal(props.strokeStyle, "#ffffff");
    const n = names(calls);
    assert.ok(n.indexOf("stroke") < n.indexOf("drawImage"));
  });
  it("a shadow is set up before the shape is filled and turned off for the border", () => {
    const { ctx, props } = recorder();
    drawMaskedImage(ctx, img, { ...base, shadow: { color: "#000000", blur: 20, x: 3, y: 9, opacity: 0.5 }, outline: { color: "#ffffff", width: 4 } } as Element);
    assert.equal(props.shadowBlur, 20);
    assert.equal(props.shadowOffsetY, 9);
    assert.equal(props.shadowColor, "transparent");
  });
  it("an adjusted copy is a canvas, maybe smaller than the photo, and a crop is still read as a fraction of it", () => {
    const canvas = { width: 1000, height: 500 } as HTMLCanvasElement;
    const { ctx, calls } = recorder();
    drawMaskedImage(ctx, canvas, { ...base, w: 400, h: 500, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } } as Element);
    assert.deepEqual(calls.find((c) => c[0] === "drawImage"), ["drawImage", canvas, 250, 0, 500, 500, 0, 0, 400, 500]);
  });

  it("a shadow with no border fills the shape in black first, and a border 0 wide is no border at all", () => {
    const only = recorder();
    drawMaskedImage(only.ctx, img, { ...base, shadow: { color: "#000000", blur: 20, x: 3, y: 9, opacity: 0.5 } } as Element);
    assert.equal(only.props.fillStyle, "#000000");
    assert.ok(!names(only.calls).includes("stroke"));
    assert.equal(only.props.shadowBlur, 20);
    const zero = recorder();
    drawMaskedImage(zero.ctx, img, { ...base, outline: { color: "#ff0000", width: 0 } } as Element);
    assert.ok(!names(zero.calls).includes("stroke") && !names(zero.calls).includes("fill"), "no halo is drawn for a border of 0");
    const plain = recorder();
    drawMaskedImage(plain.ctx, img, base as Element);
    assert.ok(!names(plain.calls).includes("fill") && names(plain.calls).includes("drawImage"));
  });

  it("ruled lines are drawn across only, with no vertical ones", () => {
    const r = recorder();
    drawPattern(r.ctx, { kind: "lines", color: "#cccccc", size: 100, thickness: 2 }, 300, 200);
    assert.equal(names(r.calls).filter((x) => x === "moveTo").length, 3, "y = 0, 100, 200");
    assert.ok(r.calls.filter((c) => c[0] === "moveTo").every((c) => c[1] === 0));
  });

  it("a grid draws a line per step across the artboard, and dots draw one dot per cell", () => {
    const g = recorder();
    drawPattern(g.ctx, { kind: "grid", color: "#cccccc", size: 100, thickness: 2 }, 300, 200);
    assert.equal(names(g.calls).filter((x) => x === "moveTo").length, 4 + 3); // x = 0,100,200,300 and y = 0,100,200
    assert.equal(g.props.lineWidth, 2);
    const d = recorder();
    drawPattern(d.ctx, { kind: "dots", color: "#cccccc", size: 100, thickness: 3 }, 300, 200);
    assert.equal(names(d.calls).filter((x) => x === "arc").length, 3 * 2);
  });
});
