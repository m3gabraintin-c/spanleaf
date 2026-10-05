import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { useEditor } from "@/editor/store";
import type { Project } from "@/data/types";
import type { Doc, Element } from "@/lib/doc";
import { DocSchema } from "@/lib/doc";
import { DEFAULT_PEN, MAX_PEN_SIZE, MIN_PEN_SIZE, strokeElement, StrokeRecorder } from "@/lib/stroke";

const S = () => useEditor.getState();
const el = (id: string, type: Element["type"] = "drawing"): Element => ({ id, type, x: 0, y: 0, w: 50, h: 50, rotation: 0, locked: false });
const project = (elements: Element[]): Project => ({ id: "p1", title: "T", format: "portrait_4_5", slideCount: 2, rev: 0, updatedAt: new Date().toISOString(), doc: { v: 1, background: { type: "color", value: "#ffffff" }, elements } });

describe("the pen", () => {
  beforeEach(() => S().load(project([])));
  it("starts as a black pen and changes one setting at a time", () => {
    S().setPen(DEFAULT_PEN);
    assert.deepEqual(S().pen, DEFAULT_PEN);
    S().setPen({ color: "#e5484d" });
    assert.deepEqual(S().pen, { ...DEFAULT_PEN, color: "#e5484d" });
    S().setPen({ mode: "eraser" });
    assert.equal(S().pen.mode, "eraser");
    assert.equal(S().pen.color, "#e5484d", "the colour is kept for when the pen is picked up again");
  });
  it("holds the size between the smallest and the biggest", () => {
    S().setPen({ size: -5 });
    assert.equal(S().pen.size, MIN_PEN_SIZE);
    S().setPen({ size: 5000 });
    assert.equal(S().pen.size, MAX_PEN_SIZE);
    S().setPen({ size: 30 });
    assert.equal(S().pen.size, 30);
  });
  it("is not part of the project: changing it doesn't mark the project unsaved or make an undo step", () => {
    S().load(project([]));
    S().setPen({ color: "#0090ff", size: 40, mode: "highlighter" });
    assert.equal(S().saveStatus, "saved");
    assert.equal(S().docVersion, 0);
    assert.equal(S().past.length, 0);
  });
});

describe("adding and removing strokes", () => {
  beforeEach(() => S().load(project([el("a", "image"), el("s1"), el("s2"), el("s3")])));

  it("a new layer is selected unless it is told not to be", () => {
    S().addElement(el("x"));
    assert.equal(S().selectedId, "x");
    S().select(null);
    S().addElement(el("y"), { select: false });
    assert.equal(S().selectedId, null);
    assert.equal(S().doc.elements.at(-1)!.id, "y");
  });

  it("removeElements takes several layers away as one undo step, and undo brings them all back in place", () => {
    const before = structuredClone(S().doc.elements);
    S().removeElements(["s1", "s3"]);
    assert.deepEqual(S().doc.elements.map((e) => e.id), ["a", "s2"]);
    assert.equal(S().past.length, 1);
    assert.equal(S().saveStatus, "unsaved");
    S().undo();
    assert.deepEqual(S().doc.elements, before);
  });

  it("calls with the same key close together are one step, so rubbing out a long stroke is one undo", () => {
    S().removeElements(["s1"], "erase");
    S().removeElements(["s2"], "erase");
    assert.equal(S().past.length, 1);
    assert.deepEqual(S().doc.elements.map((e) => e.id), ["a", "s3"]);
    S().undo();
    assert.equal(S().doc.elements.length, 4);
  });

  it("without a key each call is its own step", () => {
    S().removeElements(["s1"]);
    S().removeElements(["s2"]);
    assert.equal(S().past.length, 2);
  });

  it("ids that aren't there change nothing at all", () => {
    const v = S().docVersion;
    S().removeElements(["nope", "also-nope"]);
    S().removeElements([]);
    assert.equal(S().docVersion, v);
    assert.equal(S().past.length, 0);
  });

  it("removing the selected layer clears the selection, and removing others keeps it", () => {
    S().select("s2");
    S().removeElements(["s1"]);
    assert.equal(S().selectedId, "s2");
    S().removeElements(["s2", "s3"]);
    assert.equal(S().selectedId, null);
  });

  it("a whole stroke, from points to the saved project, can be undone", () => {
    S().load(project([]));
    const rec = new StrokeRecorder(2);
    for (let i = 0; i < 30; i++) rec.add({ x: 100 + i * 5, y: 200 + Math.sin(i / 3) * 30 });
    const made = strokeElement(rec.finish({ x: 260, y: 210 }), { color: "#e5484d", width: 12, opacity: 1 });
    S().addElement(made, { select: false });
    assert.ok(DocSchema.safeParse(S().doc as Doc).success);
    assert.equal(S().doc.elements.length, 1);
    S().undo();
    assert.equal(S().doc.elements.length, 0);
    S().redo();
    assert.deepEqual(S().doc.elements[0], made);
  });
});
