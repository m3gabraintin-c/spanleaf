import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "@/data/types";
import { useEditor } from "@/editor/store";
import { ALIGNMENTS, alignedPosition, boundsOf } from "@/lib/align";
import type { Element } from "@/lib/doc";
import { FORMATS, SLIDE_WIDTH } from "@/lib/formats";
import { seeded } from "@/lib/geometry";

const H = FORMATS.portrait_4_5.height;
const W = SLIDE_WIDTH;
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;
const box = (x: number, y: number, w: number, h: number, rotation = 0) => ({ x, y, w, h, rotation });

describe("boundsOf", () => {
  it("is the layer's own box when it isn't turned", () => {
    assert.deepEqual(boundsOf(box(100, 200, 300, 50)), { l: 100, r: 400, t: 200, b: 250 });
  });
  it("turned a quarter about its top-left corner, it reaches to the left of x and its width and height swap", () => {
    const b = boundsOf(box(500, 100, 300, 50, 90));
    assert.ok(near(b.l, 450) && near(b.r, 500) && near(b.t, 100) && near(b.b, 400), JSON.stringify(b));
  });
  it("turned half way round it is the same size, on the other side of its corner", () => {
    const b = boundsOf(box(500, 500, 300, 50, 180));
    assert.ok(near(b.l, 200) && near(b.r, 500) && near(b.t, 450) && near(b.b, 500));
  });
  it("a 45 degree turn of a square reaches the diagonal", () => {
    const b = boundsOf(box(0, 0, 100, 100, 45));
    assert.ok(near(b.r - b.l, 141.42) && near(b.b - b.t, 141.42, 0.02));
  });
});

describe("alignedPosition", () => {
  const e = box(1300, 400, 200, 100); // on slide 1 (1080 to 2160)
  it("lines up with the left, right and middle of the slide it is on, not slide 0", () => {
    assert.equal(alignedPosition(e, "left", 3, H).x, W);
    assert.equal(alignedPosition(e, "right", 3, H).x, 2 * W - 200);
    assert.equal(alignedPosition(e, "centre", 3, H).x, W + W / 2 - 100);
  });
  it("lines up with the top, bottom and middle of the slide", () => {
    assert.equal(alignedPosition(e, "top", 3, H).y, 0);
    assert.equal(alignedPosition(e, "bottom", 3, H).y, H - 100);
    assert.equal(alignedPosition(e, "middle", 3, H).y, H / 2 - 50);
  });
  it("only moves in the direction asked", () => {
    assert.equal(alignedPosition(e, "left", 3, H).y, e.y);
    assert.equal(alignedPosition(e, "top", 3, H).x, e.x);
  });
  it("what lines up is the turned shape: after any alignment the turned box sits exactly on the target, for every turn", () => {
    const r = seeded(6);
    for (let k = 0; k < 400; k++) {
      const el = box(r() * 3000, r() * 1200, 40 + r() * 600, 40 + r() * 600, (r() - 0.5) * 720);
      const how = ALIGNMENTS[k % 6];
      const at = alignedPosition(el, how, 3, H);
      const after = boundsOf({ ...el, ...at });
      const slide = Math.min(2, Math.max(0, Math.floor((el.x + el.w / 2) / W)));
      const target = { left: after.l - slide * W, right: after.r - (slide + 1) * W, centre: (after.l + after.r) / 2 - (slide + 0.5) * W, top: after.t, bottom: after.b - H, middle: (after.t + after.b) / 2 - H / 2 }[how];
      assert.ok(near(target, 0, 0.05), `${how} case ${k}: ${target}`);
    }
  });
  it("doing it twice changes nothing more", () => {
    const el = box(1300, 400, 200, 100, 30);
    for (const how of ALIGNMENTS) {
      const once = alignedPosition(el, how, 3, H);
      const twice = alignedPosition({ ...el, ...once }, how, 3, H);
      assert.ok(near(twice.x, once.x) && near(twice.y, once.y), how);
    }
  });
  it("a layer off the end of the carousel lines up with the nearest slide, left or right", () => {
    assert.equal(alignedPosition(box(9 * W, 0, 100, 100), "left", 3, H).x, 2 * W);
    assert.equal(alignedPosition(box(-500, 0, 100, 100), "left", 3, H).x, 0);
  });
});

describe("aligning in the editor", () => {
  const S = () => useEditor.getState();
  const el = (id: string, over: Partial<Element> = {}): Element => ({ id, type: "sticker", x: 1300, y: 400, w: 200, h: 100, rotation: 0, locked: false, assetPath: "builtin:star", ...over });
  const load = (elements: Element[]) => S().load({ id: "p", title: "T", format: "portrait_4_5", slideCount: 3, rev: 0, updatedAt: new Date().toISOString(), doc: { v: 1, background: { type: "color", value: "#ffffff" }, elements } } satisfies Project);

  it("moves the layer, makes one undo step, and undo puts it back", () => {
    load([el("a")]);
    S().alignElement("a", "left");
    assert.equal(S().doc.elements[0].x, W);
    assert.equal(S().doc.elements[0].y, 400);
    assert.equal(S().past.length, 1);
    S().undo();
    assert.equal(S().doc.elements[0].x, 1300);
  });
  it("does nothing when already there, to a locked layer, or to one that isn't there, and makes no undo step", () => {
    load([el("a", { x: W }), el("b", { locked: true })]);
    S().alignElement("a", "left");
    S().alignElement("b", "left");
    S().alignElement("nope", "left");
    assert.equal(S().past.length, 0);
    assert.equal(S().doc.elements[1].x, 1300);
  });
  it("uses the format's height, so it fits a story as well as a portrait", () => {
    S().load({ id: "p", title: "T", format: "story_9_16", slideCount: 1, rev: 0, updatedAt: new Date().toISOString(), doc: { v: 1, background: { type: "color", value: "#ffffff" }, elements: [el("a", { x: 100 })] } });
    S().alignElement("a", "bottom");
    assert.equal(S().doc.elements[0].y, FORMATS.story_9_16.height - 100);
  });
});
