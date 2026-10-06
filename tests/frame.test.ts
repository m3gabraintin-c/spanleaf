import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DocSchema } from "@/lib/doc";
import { edgeOf, FRAME_EDGES, maskFor } from "@/lib/frame";
import { OutlineSchema, ShadowSchema, SOFT_SHADOW, WHITE_BORDER } from "@/lib/look";
import { maskPolygon } from "@/lib/geometry";

const doc = (el: object) => ({ v: 1 as const, background: { type: "color" as const, value: "#ffffff" }, elements: [{ id: "a", type: "image", x: 0, y: 0, w: 400, h: 300, rotation: 0, locked: false, ...el }] as never });

describe("photo edges", () => {
  it("every choice makes a valid cut that reads back as the same choice", () => {
    for (const edge of FRAME_EDGES) {
      const mask = maskFor(edge, 4242);
      assert.ok(DocSchema.safeParse(doc({ mask })).success, edge);
      assert.equal(edgeOf(mask), edge);
    }
  });
  it("only a torn edge carries a seed, and the seed decides how it tears", () => {
    for (const edge of FRAME_EDGES) assert.equal("seed" in maskFor(edge, 7), edge === "torn", edge);
    assert.notDeepEqual(maskPolygon("torn", 400, 300, { seed: 1 }), maskPolygon("torn", 400, 300, { seed: 2 }));
    assert.deepEqual(maskFor("torn", 9), maskFor("torn", 9));
  });
  it("no cut at all is square, and a theme's other cuts read as the nearest choice", () => {
    assert.equal(edgeOf(undefined), "square");
    assert.equal(edgeOf({ shape: "rounded", radius: 0.5 }), "rounded");
    assert.equal(edgeOf({ shape: "rounded" }), "rounded");
  });
  it("each choice draws a different outline", () => {
    const shapes = FRAME_EDGES.map((e) => JSON.stringify(maskPolygon(maskFor(e, 3).shape, 400, 300, { radius: maskFor(e, 3).radius, seed: 3 })));
    assert.equal(new Set(shapes).size, FRAME_EDGES.length);
  });
});

describe("what a border and a shadow start as", () => {
  it("are valid, and are copies so changing one photo's can't change the next", () => {
    assert.ok(OutlineSchema.safeParse(WHITE_BORDER).success);
    assert.ok(ShadowSchema.safeParse(SOFT_SHADOW).success);
    assert.ok(DocSchema.safeParse(doc({ outline: { ...WHITE_BORDER }, shadow: { ...SOFT_SHADOW }, opacity: 0.1 })).success);
  });
  it("opacity from 10% to 100% is valid and the borders the panel allows (1 to 40) are too", () => {
    for (const opacity of [0.1, 0.5, 1]) assert.ok(DocSchema.safeParse(doc({ opacity })).success);
    for (const width of [1, 10, 40]) assert.ok(DocSchema.safeParse(doc({ outline: { color: "#ffffff", width } })).success);
  });
});
