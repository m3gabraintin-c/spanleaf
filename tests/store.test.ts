import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { useEditor } from "@/editor/store";
import type { Element } from "@/lib/doc";
import type { Project } from "@/data/types";

const el = (id: string, over: Partial<Element> = {}): Element => ({ id, type: "image", x: 0, y: 0, w: 100, h: 100, rotation: 0, locked: false, ...over });
const project = (elements: Element[] = []): Project => ({
  id: "p1", title: "T", format: "square", slideCount: 3, rev: 0, updatedAt: new Date().toISOString(),
  doc: { v: 1, background: { type: "color", value: "#ffffff" }, elements },
});
const S = () => useEditor.getState();
const ids = () => S().doc.elements.map((e) => e.id);

beforeEach(() => S().load(project()));

describe("undo and redo", () => {
  it("undoes and redoes an add, a move and a delete in order", () => {
    S().addElement(el("a"));
    S().updateElement("a", { x: 50 });
    S().removeElement("a");
    assert.deepEqual(ids(), []);
    S().undo();
    assert.deepEqual(ids(), ["a"]);
    assert.equal(S().doc.elements[0].x, 50);
    S().undo();
    assert.equal(S().doc.elements[0].x, 0);
    S().undo();
    assert.deepEqual(ids(), []);
    S().redo();
    S().redo();
    S().redo();
    assert.deepEqual(ids(), []);
    assert.equal(S().past.length, 3);
  });
  it("a new edit after an undo throws the redo history away", () => {
    S().addElement(el("a"));
    S().addElement(el("b"));
    S().undo();
    assert.equal(S().future.length, 1);
    S().addElement(el("c"));
    assert.equal(S().future.length, 0);
    assert.deepEqual(ids(), ["a", "c"]);
  });
  it("nothing to undo does nothing and doesn't mark the project as changed", () => {
    const v = S().docVersion;
    S().undo();
    S().redo();
    assert.equal(S().docVersion, v);
    assert.equal(S().saveStatus, "saved");
  });
  it("undo and redo mark the project as changed so they get saved", () => {
    S().addElement(el("a"));
    S().setSaveStatus("saved");
    const v = S().docVersion;
    S().undo();
    assert.ok(S().docVersion > v);
    assert.equal(S().saveStatus, "unsaved");
  });
  it("quick edits with the same key are one step, and a different key or a pause starts a new one", () => {
    S().addElement(el("a"));
    const base = S().past.length;
    for (let i = 1; i <= 20; i++) S().updateElement("a", { x: i }, { key: "nudge:a" });
    assert.equal(S().past.length, base + 1, "twenty nudges, one undo step");
    S().updateElement("a", { y: 5 }, { key: "nudge:b" });
    assert.equal(S().past.length, base + 2);
    S().undo();
    assert.equal(S().doc.elements[0].y, 0);
    assert.equal(S().doc.elements[0].x, 20);
    S().undo();
    assert.equal(S().doc.elements[0].x, 0);
  });
  it("a selection that no longer exists after undo is cleared", () => {
    S().addElement(el("a"));
    assert.equal(S().selectedId, "a");
    S().undo();
    assert.equal(S().selectedId, null);
  });
  it("keeps at most 100 steps", () => {
    for (let i = 0; i < 130; i++) S().addElement(el(`e${i}`));
    assert.equal(S().past.length, 100);
  });
  it("opening a project starts with no history", () => {
    S().addElement(el("a"));
    S().load(project([el("z")]));
    assert.equal(S().past.length + S().future.length, 0);
  });
  it("editing after an undo never changes the stored history (snapshots are frozen)", () => {
    S().addElement(el("a", { x: 1 }));
    S().updateElement("a", { x: 2 });
    S().undo();
    const redoSnapshot = S().future[0];
    S().updateElement("a", { x: 9 });
    assert.equal(redoSnapshot.doc.elements[0].x, 2, "the redo snapshot is untouched");
    assert.equal(S().past.some((d) => d.doc.elements[0]?.x === 9), false);
    assert.throws(() => {
      "use strict";
      (S().past[0].doc as { v: number }).v = 5;
    });
  });
});

describe("measuring text height", () => {
  it("is saved but never an undo step, and changes older snapshots too", () => {
    S().addElement(el("t", { type: "text", h: 100 }));
    S().updateElement("t", { x: 10 });
    const steps = S().past.length;
    S().measureElement("t", { h: 130 });
    assert.equal(S().past.length, steps);
    assert.equal(S().doc.elements[0].h, 130);
    S().undo();
    assert.equal(S().doc.elements[0].h, 130, "undo must not bring back a stale height");
    assert.equal(S().doc.elements[0].x, 0);
  });
  it("a measurement within half a pixel changes nothing, so it can't start a save loop", () => {
    S().addElement(el("t", { type: "text", h: 100 }));
    S().setSaveStatus("saved");
    const v = S().docVersion;
    S().measureElement("t", { h: 100.3 });
    assert.equal(S().docVersion, v);
    assert.equal(S().saveStatus, "saved");
  });
});

describe("layers", () => {
  beforeEach(() => {
    S().load(project([el("a"), el("b"), el("c")]));
  });
  it("forward, backward, front and back", () => {
    S().moveLayer("a", "forward");
    assert.deepEqual(ids(), ["b", "a", "c"]);
    S().moveLayer("a", "front");
    assert.deepEqual(ids(), ["b", "c", "a"]);
    S().moveLayer("a", "backward");
    assert.deepEqual(ids(), ["b", "a", "c"]);
    S().moveLayer("a", "back");
    assert.deepEqual(ids(), ["a", "b", "c"]);
  });
  it("moving past either end does nothing and adds no undo step", () => {
    const steps = S().past.length;
    S().moveLayer("c", "front");
    S().moveLayer("a", "back");
    S().moveLayer("c", "forward");
    assert.equal(S().past.length, steps);
    assert.deepEqual(ids(), ["a", "b", "c"]);
  });
  it("reorder to an index, clamped to the ends", () => {
    S().reorderLayer("a", 2);
    assert.deepEqual(ids(), ["b", "c", "a"]);
    S().reorderLayer("a", -5);
    assert.deepEqual(ids(), ["a", "b", "c"]);
    S().reorderLayer("a", 99);
    assert.deepEqual(ids(), ["b", "c", "a"]);
  });
  it("an unknown id is ignored everywhere", () => {
    const steps = S().past.length;
    S().moveLayer("nope", "front");
    S().reorderLayer("nope", 0);
    S().toggleLock("nope");
    S().removeElement("nope");
    assert.equal(S().duplicateElement("nope"), null);
    assert.equal(S().past.length, steps);
  });
  it("lock toggles and can be undone", () => {
    S().toggleLock("b");
    assert.equal(S().doc.elements[1].locked, true);
    S().undo();
    assert.equal(S().doc.elements[1].locked, false);
  });
});

describe("duplicate", () => {
  it("copies right above the original, offset, selected, with a new id, and unlocked", () => {
    S().load(project([el("a", { x: 10, y: 20, locked: true, mediaId: "m1" }), el("b")]));
    const id = S().duplicateElement("a", 48);
    assert.ok(id && id !== "a");
    assert.deepEqual(S().doc.elements.map((e) => e.id), ["a", id, "b"]);
    const copy = S().doc.elements[1];
    assert.deepEqual([copy.x, copy.y, copy.mediaId, copy.locked], [58, 68, "m1", false]);
    assert.equal(S().selectedId, id);
    S().undo();
    assert.deepEqual(ids(), ["a", "b"]);
  });
  it("a copy near the edge stays where it can be found", () => {
    S().load(project([el("a", { x: 1050, y: 1050, w: 300, h: 300 })]));
    S().duplicateElement("a", 48, { w: 1080, h: 1080 });
    const copy = S().doc.elements[1];
    assert.ok(copy.x <= 1080 - 80 && copy.y <= 1080 - 80);
  });
  it("copies text with its own copy of the text settings", () => {
    S().load(project([el("t", { type: "text", text: { value: "hi", font: "inter", size: 40, color: "#000000", align: "left", bold: false } })]));
    const id = S().duplicateElement("t")!;
    S().updateElement(id, { text: { ...S().doc.elements[1].text!, value: "changed" } });
    assert.equal(S().doc.elements[0].text!.value, "hi");
  });
});

describe("background", () => {
  it("sets, ignores the same colour in other letter case, coalesces quick changes, and undoes", () => {
    S().setBackground("#ff0000");
    assert.equal(S().doc.background.value, "#ff0000");
    const steps = S().past.length;
    S().setBackground("#FF0000");
    assert.equal(S().past.length, steps);
    S().setBackground("#00ff00");
    S().setBackground("#0000ff");
    assert.equal(S().past.length, steps, "dragging through colours is one step");
    S().undo();
    assert.equal(S().doc.background.value, "#ffffff", "all the quick changes were one step, so undo goes back to before the first");
  });
});
