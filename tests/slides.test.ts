import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "@/data/types";
import { savePatch } from "@/editor/useAutosave";
import { useEditor } from "@/editor/store";
import { DocSchema, MAX_ELEMENTS, type Doc, type Element } from "@/lib/doc";
import { MAX_SLIDES, SLIDE_WIDTH } from "@/lib/formats";
import { seeded } from "@/lib/geometry";
import { duplicateSlide, insertSlide, moveSlide, removeSlide, slideOf } from "@/lib/slides";

const W = SLIDE_WIDTH;
/** A layer whose middle is on the given slide, at fraction f across it. */
const on = (id: string, slide: number, f = 0.5, w = 200): Element => ({ id, type: "sticker", x: slide * W + f * W - w / 2, y: 100, w, h: 100, rotation: 0, locked: false, assetPath: "builtin:star" });
const doc = (elements: Element[]): Doc => ({ v: 1, background: { type: "color", value: "#ffffff" }, elements });
const where = (d: Doc) => Object.fromEntries(d.elements.map((e) => [e.id, slideOf(e)]));
let n = 0;
const newId = () => `copy${++n}`;

describe("slideOf", () => {
  it("is the slide under a layer's middle, counting from 0, and goes outside 0..count at the sides", () => {
    assert.equal(slideOf(on("a", 0)), 0);
    assert.equal(slideOf(on("a", 3, 0.99)), 3);
    assert.equal(slideOf({ x: W - 100, w: 200 }), 1, "a layer bridging two slides belongs to the one holding its middle");
    assert.equal(slideOf({ x: W - 101, w: 200 }), 0);
    assert.equal(slideOf({ x: -500, w: 100 }), -1);
    assert.equal(slideOf({ x: 9 * W, w: 100 }), 9);
  });
});

describe("insertSlide", () => {
  it("opens a blank slide: layers from there on move one slide along, earlier ones stay", () => {
    const d = doc([on("a", 0), on("b", 1), on("c", 2), on("d", 3)]);
    assert.deepEqual(where(insertSlide(d, 2)), { a: 0, b: 1, c: 3, d: 4 });
    assert.deepEqual(where(insertSlide(d, 0)), { a: 1, b: 2, c: 3, d: 4 });
    assert.deepEqual(where(insertSlide(d, 4)), { a: 0, b: 1, c: 2, d: 3 }, "at the end, nothing moves");
  });
  it("moves layers by exactly one slide width and changes nothing else, and leaves what it was given alone", () => {
    const d = doc([on("a", 1, 0.3), on("b", 2, 0.7)]);
    const frozen = structuredClone(d);
    const out = insertSlide(d, 1);
    assert.deepEqual(d, frozen);
    out.elements.forEach((e, i) => assert.deepEqual({ ...e, x: 0 }, { ...d.elements[i], x: 0 }));
    out.elements.forEach((e, i) => assert.equal(e.x, d.elements[i].x + W));
  });
  it("keeps the document's background, pattern and compose notes", () => {
    const d = { ...doc([on("a", 0)]), pattern: { kind: "grid", color: "#ffffff", ink: "#000000", size: 40, thickness: 1 } } as unknown as Doc;
    assert.deepEqual({ ...insertSlide(d, 0), elements: [] }, { ...d, elements: [] });
  });
});

describe("removeSlide", () => {
  it("takes the slide's layers away and brings the later ones back a slide", () => {
    const d = doc([on("a", 0), on("b", 1), on("b2", 1, 0.2), on("c", 2), on("d", 3)]);
    const out = removeSlide(d, 1);
    assert.deepEqual(where(out), { a: 0, c: 1, d: 2 });
    assert.deepEqual(out.elements.map((e) => e.id), ["a", "c", "d"]);
  });
  it("removing the last slide leaves the others where they were", () => {
    assert.deepEqual(where(removeSlide(doc([on("a", 0), on("b", 1), on("c", 2)]), 2)), { a: 0, b: 1 });
  });
  it("a layer to the right of every slide moves back with the rest, one to the left of the first stays", () => {
    const stray = { ...on("far", 0), x: 9 * W };
    const left = { ...on("left", 0), x: -400 };
    const out = removeSlide(doc([on("a", 0), on("b", 1), stray, left]), 0);
    assert.equal(out.elements.find((e) => e.id === "far")!.x, 8 * W);
    assert.equal(out.elements.find((e) => e.id === "left")!.x, -400);
  });
  it("insert then remove at the same place gives the document back exactly", () => {
    const d = doc([on("a", 0, 0.1), on("b", 1, 0.9), on("c", 2), on("d", 5, 0.4)]);
    for (const at of [0, 1, 2, 3]) assert.deepEqual(removeSlide(insertSlide(d, at), at), d, `at ${at}`);
  });
});

describe("duplicateSlide", () => {
  it("puts a copy of the slide straight after it, with new ids, on top, and pushes the later slides along", () => {
    const d = doc([on("a", 0), on("b", 1), on("b2", 1, 0.2), on("c", 2)]);
    const out = duplicateSlide(d, 1, newId);
    assert.equal(out.elements.length, 6);
    assert.deepEqual(out.elements.slice(0, 4).map((e) => e.id), ["a", "b", "b2", "c"]);
    assert.deepEqual(out.elements.slice(4).map((e) => slideOf(e)), [2, 2]);
    assert.equal(out.elements.find((e) => e.id === "c")!.x, 3 * W + (d.elements[3].x - 2 * W));
    assert.equal(new Set(out.elements.map((e) => e.id)).size, 6, "every id is different");
    const [c1, c2] = out.elements.slice(4);
    assert.deepEqual({ ...c1, id: "", x: 0 }, { ...d.elements[1], id: "", x: 0 });
    assert.equal(c1.x, d.elements[1].x + W);
    assert.equal(c2.x, d.elements[2].x + W);
  });
  it("copying an empty slide just adds a blank one", () => {
    const d = doc([on("a", 0), on("c", 2)]);
    const out = duplicateSlide(d, 1, newId);
    assert.deepEqual(where(out), { a: 0, c: 3 });
  });
  it("copying then deleting the copy gives the document back", () => {
    const d = doc([on("a", 0), on("b", 1), on("c", 2)]);
    assert.deepEqual(removeSlide(duplicateSlide(d, 1, newId), 2), d);
  });
});

describe("moveSlide", () => {
  const d = doc([on("s0", 0), on("s1", 1), on("s2", 2), on("s3", 3), on("s4", 4)]);
  it("moves a slide later, the ones in between making room", () => {
    assert.deepEqual(where(moveSlide(d, 5, 1, 3)), { s0: 0, s1: 3, s2: 1, s3: 2, s4: 4 });
  });
  it("moves a slide earlier", () => {
    assert.deepEqual(where(moveSlide(d, 5, 4, 1)), { s0: 0, s1: 2, s2: 3, s3: 4, s4: 1 });
  });
  it("moving to the same place is no change, and returns the same document", () => {
    assert.equal(moveSlide(d, 5, 2, 2), d);
  });
  it("moving and moving back puts everything where it was, for every pair of slides", () => {
    for (let from = 0; from < 5; from++) for (let to = 0; to < 5; to++) assert.deepEqual(moveSlide(moveSlide(d, 5, from, to), 5, to, from), d, `${from} to ${to}`);
  });
  it("every slide's layers stay together, and the slides come out in a different order but all present", () => {
    const r = seeded(4);
    const big = doc(Array.from({ length: 40 }, (_, i) => on(`e${i}`, Math.floor(r() * 6), r())));
    for (let k = 0; k < 40; k++) {
      const from = Math.floor(r() * 6);
      const to = Math.floor(r() * 6);
      const out = moveSlide(big, 6, from, to);
      const before = where(big);
      const after = where(out);
      const target = Object.keys(before).filter((id) => before[id] === from);
      for (const id of target) assert.equal(after[id], to);
      for (const id of Object.keys(before)) assert.ok(after[id] >= 0 && after[id] < 6);
      assert.deepEqual(out.elements.map((e) => e.id), big.elements.map((e) => e.id), "order of layers (their stacking) is kept");
    }
  });
  it("a layer outside every slide is left alone", () => {
    const stray = { ...on("far", 0), x: 12 * W };
    assert.equal(moveSlide(doc([stray, on("a", 1)]), 3, 1, 2).elements[0].x, 12 * W);
  });
});

describe("every operation gives a valid document", () => {
  it("passes the same check a saved project does", () => {
    const d = doc([on("a", 0), on("b", 1)]);
    for (const out of [insertSlide(d, 1), removeSlide(d, 0), duplicateSlide(d, 0, newId), moveSlide(d, 2, 0, 1)]) assert.ok(DocSchema.safeParse(out).success);
  });
});

describe("slides in the editor", () => {
  const S = () => useEditor.getState();
  const project = (elements: Element[], slideCount: number): Project => ({ id: "p1", title: "T", format: "portrait_4_5", slideCount, rev: 4, updatedAt: new Date().toISOString(), doc: doc(elements) });

  it("adds a slide, counts it, marks the project unsaved, and one undo takes it back", () => {
    S().load(project([on("a", 0), on("b", 1)], 2));
    S().addSlide(1);
    assert.equal(S().slideCount, 3);
    assert.deepEqual(where(S().doc), { a: 0, b: 2 });
    assert.equal(S().saveStatus, "unsaved");
    S().undo();
    assert.equal(S().slideCount, 2);
    assert.deepEqual(where(S().doc), { a: 0, b: 1 });
    S().redo();
    assert.equal(S().slideCount, 3);
  });

  it("deleting a slide removes its layers, and undo brings back both the layers and the slide", () => {
    S().load(project([on("a", 0), on("b", 1), on("c", 2)], 3));
    S().select("b");
    S().deleteSlide(1);
    assert.equal(S().slideCount, 2);
    assert.deepEqual(where(S().doc), { a: 0, c: 1 });
    assert.equal(S().selectedId, null, "the deleted layer is no longer selected");
    S().undo();
    assert.equal(S().slideCount, 3);
    assert.deepEqual(where(S().doc), { a: 0, b: 1, c: 2 });
  });

  it("a project's only slide can't be deleted", () => {
    S().load(project([on("a", 0)], 1));
    S().deleteSlide(0);
    assert.equal(S().slideCount, 1);
    assert.equal(S().doc.elements.length, 1);
    assert.equal(S().past.length, 0);
  });

  it("copies a slide and moves a slide, each as one undo step", () => {
    S().load(project([on("a", 0), on("b", 1)], 2));
    S().duplicateSlide(0);
    assert.equal(S().slideCount, 3);
    assert.equal(S().doc.elements.length, 3);
    S().moveSlide(2, 0);
    assert.equal(S().past.length, 2);
    S().undo();
    S().undo();
    assert.equal(S().slideCount, 2);
    assert.equal(S().doc.elements.length, 2);
  });

  it("refuses out-of-range requests without making an undo step", () => {
    S().load(project([on("a", 0)], 2));
    S().addSlide(-1);
    S().addSlide(3);
    S().duplicateSlide(2);
    S().deleteSlide(2);
    S().moveSlide(0, 2);
    S().moveSlide(1, 1);
    assert.equal(S().slideCount, 2);
    assert.equal(S().past.length, 0);
  });

  it("stops at the most slides, whichever way they are added", () => {
    S().load(project([on("a", 0)], MAX_SLIDES));
    S().addSlide(0);
    S().duplicateSlide(0);
    assert.equal(S().slideCount, MAX_SLIDES);
    assert.equal(S().past.length, 0);
  });

  it("refuses to copy a slide when the copy would pass the layer limit, and says so", () => {
    S().load(project(Array.from({ length: MAX_ELEMENTS - 1 }, (_, i) => on(`e${i}`, 0, (i % 100) / 100)), 2));
    S().duplicateSlide(0);
    assert.equal(S().slideCount, 2);
    assert.equal(S().doc.elements.length, MAX_ELEMENTS - 1);
    assert.match(S().announcement, /limit of 500 layers/);
  });

  it("a long project works: 200 slides added one at a time, then all undone", () => {
    S().load(project([on("a", 0)], 1));
    for (let i = 0; i < 99; i++) S().addSlide(S().slideCount);
    assert.equal(S().slideCount, 100);
    for (let i = 0; i < 99; i++) S().undo();
    assert.equal(S().slideCount, 1);
  });

  it("a save carries the slide count and the format with the document", () => {
    S().load(project([on("a", 0)], 2));
    S().addSlide(2);
    const patch = savePatch(S());
    assert.deepEqual(Object.keys(patch).sort(), ["doc", "format", "rev", "slideCount"]);
    assert.equal(patch.slideCount, 3);
    assert.equal(patch.format, "portrait_4_5");
    assert.equal(patch.rev, 4);
    assert.equal(patch.doc, S().doc);
  });
});
