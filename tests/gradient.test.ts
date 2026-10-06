import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "@/data/types";
import { useEditor } from "@/editor/store";
import { hex6 } from "@/lib/colour";
import { DocSchema, EMPTY_DOC } from "@/lib/doc";
import { gradientLine } from "@/lib/gradient";
import { GradientSchema } from "@/lib/look";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("gradientLine", () => {
  it("0 runs left to right, 90 top to bottom, 180 and 270 the other ways, through the middle", () => {
    const at = (angle: number) => gradientLine(angle, 400, 200);
    const h = at(0);
    assert.ok(near(h.start.x, 0) && near(h.start.y, 100) && near(h.end.x, 400) && near(h.end.y, 100));
    const v = at(90);
    assert.ok(near(v.start.x, 200) && near(v.start.y, 0) && near(v.end.x, 200) && near(v.end.y, 200));
    const back = at(180);
    assert.ok(near(back.start.x, 400) && near(back.end.x, 0));
    const up = at(270);
    assert.ok(near(up.start.y, 200) && near(up.end.y, 0));
  });

  it("at any angle the first colour is exactly at the corner it starts from and the last at the opposite, so no part of the box is left flat", () => {
    for (const [w, h] of [[1080, 1350], [3240, 1350], [100, 100], [5400, 1920]]) {
      for (let angle = 0; angle <= 360; angle += 15) {
        const { start, end } = gradientLine(angle, w, h);
        const len = Math.hypot(end.x - start.x, end.y - start.y);
        const t = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => ((x - start.x) * (end.x - start.x) + (y - start.y) * (end.y - start.y)) / (len * len));
        assert.ok(near(Math.min(...t), 0) && near(Math.max(...t), 1), `${w}x${h} at ${angle}: ${t}`);
      }
    }
  });

  it("is symmetric about the middle of the box", () => {
    const { start, end } = gradientLine(37, 800, 300);
    assert.ok(near((start.x + end.x) / 2, 400) && near((start.y + end.y) / 2, 150));
  });
});

describe("the gradient in a saved document", () => {
  const doc = (gradient: unknown) => ({ ...EMPTY_DOC, gradient });
  it("accepts two six digit colours and an angle from 0 to 360, and no gradient at all", () => {
    assert.ok(DocSchema.safeParse(EMPTY_DOC).success);
    assert.ok(DocSchema.safeParse(doc({ from: "#ffffff", to: "#000000", angle: 0 })).success);
    assert.ok(DocSchema.safeParse(doc({ from: "#abcdef", to: "#123456", angle: 360 })).success);
  });
  it("refuses a bad colour, a missing one, or an angle outside 0 to 360", () => {
    for (const bad of [{ from: "red", to: "#000000", angle: 0 }, { from: "#fff", to: "#000000", angle: 0 }, { to: "#000000", angle: 0 }, { from: "#ffffff", to: "#000000", angle: -1 }, { from: "#ffffff", to: "#000000", angle: 361 }, { from: "#ffffff", to: "#000000", angle: NaN }, "blue"]) {
      assert.ok(!DocSchema.safeParse(doc(bad)).success, JSON.stringify(bad));
    }
    assert.ok(!GradientSchema.safeParse(null).success);
  });
});

describe("hex6", () => {
  it("keeps six digits, widens three, and falls back to white for anything else", () => {
    assert.equal(hex6("#a1b2c3"), "#a1b2c3");
    assert.equal(hex6("#FFF"), "#FFFFFF");
    assert.equal(hex6("#1a9"), "#11aa99");
    for (const bad of ["red", "", "#12", "#12345", "#1234567", "rgb(0,0,0)"]) assert.equal(hex6(bad), "#ffffff", bad);
    assert.equal(hex6("  #abc "), "#aabbcc");
  });
});

describe("setting a gradient in the editor", () => {
  const S = () => useEditor.getState();
  const project = (): Project => ({ id: "p1", title: "T", format: "portrait_4_5", slideCount: 3, rev: 0, updatedAt: new Date().toISOString(), doc: structuredClone(EMPTY_DOC) });
  const g = { from: "#ffffff", to: "#3b3b6b", angle: 90 };

  it("sets it, marks the project unsaved, and one undo takes it away and redo brings it back", () => {
    S().load(project());
    S().setGradient(g);
    assert.deepEqual(S().doc.gradient, g);
    assert.equal(S().saveStatus, "unsaved");
    assert.ok(DocSchema.safeParse(S().doc).success);
    S().undo();
    assert.equal(S().doc.gradient, undefined);
    S().redo();
    assert.deepEqual(S().doc.gradient, g);
  });
  it("dragging through colours or angles is one undo step", () => {
    S().load(project());
    S().setGradient(g);
    for (let a = 91; a < 130; a++) S().setGradient({ ...g, angle: a });
    assert.equal(S().past.length, 1);
    assert.equal(S().doc.gradient!.angle, 129);
  });
  it("setting the same thing again changes nothing, and null removes it", () => {
    S().load(project());
    S().setGradient(g);
    const steps = S().past.length;
    const v = S().docVersion;
    S().setGradient({ ...g });
    assert.equal(S().past.length, steps);
    assert.equal(S().docVersion, v);
    S().setGradient(null);
    assert.equal("gradient" in S().doc, false, "the field is gone, not left empty");
    assert.equal(S().past.length, steps, "switching it on and straight off is still one step");
    const after = S().docVersion;
    S().setGradient(null);
    assert.equal(S().docVersion, after, "removing what isn't there changes nothing");
  });
});
