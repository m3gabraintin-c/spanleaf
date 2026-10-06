import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutCarousel, type LayoutPhoto } from "@/lib/compose";
import type { Doc, Element } from "@/lib/doc";
import { FORMAT_KEYS, FORMATS } from "@/lib/formats";
import { FALLBACK_PLAN } from "@/lib/plan";
import { changeFormat } from "@/lib/resize";
import { THEME_IDS } from "@/lib/themes";
import { useEditor } from "@/editor/store";
import type { Project } from "@/data/types";
import { boxOf } from "./layout-checks";

const SHAPES = [[4000, 3000], [3000, 4000], [6000, 2000], [3000, 3000], [2000, 5000], [4800, 2700], [3500, 3000], [2500, 4000]];
const photos = (n: number): LayoutPhoto[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, width: SHAPES[i % SHAPES.length][0] + 31 * i, height: SHAPES[i % SHAPES.length][1] }));
const made = (n: number, theme: (typeof THEME_IDS)[number], format: (typeof FORMAT_KEYS)[number] = "portrait_4_5") => {
  const out = layoutCarousel(photos(n), { ...FALLBACK_PLAN, title: "hi", captions: ["one"] }, { format, maxSlides: 10, seed: 5, theme });
  return { doc: out.doc, slideCount: out.slideCount };
};
const plain = (): Doc => ({
  v: 1,
  background: { type: "color", value: "#ffffff" },
  elements: [
    { id: "a", type: "image", x: 40, y: 100, w: 500, h: 400, rotation: 3, locked: false, mediaId: "m1" },
    { id: "b", type: "text", x: 700, y: 600, w: 300, h: 100, rotation: 0, locked: true, text: { value: "hi", font: "inter", size: 60, color: "#000000", align: "left", bold: false } },
    { id: "c", type: "sticker", x: 1500, y: 900, w: 200, h: 200, rotation: -10, locked: false, assetPath: "builtin:star", tint: "#f6d94a" },
  ] as Element[],
});

describe("changeFormat for a document that wasn't made from photos", () => {
  it("keeps everything's place relative to the middle of the slide", () => {
    const doc = plain();
    const next = changeFormat(doc, { from: "portrait_4_5", to: "story_9_16", slideCount: 2 });
    assert.deepEqual(next.elements.map((e) => e.y), doc.elements.map((e) => e.y + 285));
    const shorter = changeFormat(doc, { from: "portrait_4_5", to: "square", slideCount: 2 });
    assert.deepEqual(shorter.elements.map((e) => e.y), doc.elements.map((e) => e.y - 135));
  });
  it("changes nothing but y, and not the document it was given", () => {
    const doc = plain();
    const frozen = structuredClone(doc);
    const next = changeFormat(doc, { from: "portrait_4_5", to: "portrait_3_4", slideCount: 2 });
    assert.deepEqual(doc, frozen);
    next.elements.forEach((e, i) => assert.deepEqual({ ...e, y: 0 }, { ...doc.elements[i], y: 0 }));
    assert.equal(next.background, doc.background);
  });
  it("changing to any format and back puts everything exactly where it was", () => {
    for (const a of FORMAT_KEYS) for (const b of FORMAT_KEYS) {
      const there = changeFormat(plain(), { from: a, to: b, slideCount: 2 });
      assert.deepEqual(changeFormat(there, { from: b, to: a, slideCount: 2 }), plain(), `${a} to ${b} and back`);
    }
  });
  it("the same format is no change", () => {
    assert.deepEqual(changeFormat(plain(), { from: "square", to: "square", slideCount: 1 }), plain());
  });
  it("a carousel whose photos have all been removed is shifted rather than rearranged", () => {
    const { doc } = made(4, "scrapbook");
    const noPhotos: Doc = { ...doc, elements: doc.elements.filter((e) => e.type !== "image") };
    const next = changeFormat(noPhotos, { from: "portrait_4_5", to: "story_9_16", slideCount: 2 });
    assert.deepEqual(next.elements.map((e) => e.y), noPhotos.elements.map((e) => e.y + 285));
  });
});

describe("changeFormat for a carousel made from photos", () => {
  it("lays it out again for the new shape in the same theme, keeping every photo, and everything fits", () => {
    for (const theme of THEME_IDS) for (const from of FORMAT_KEYS) {
      const { doc, slideCount } = made(9, theme, from);
      for (const to of FORMAT_KEYS) {
        const next = changeFormat(doc, { from, to, slideCount });
        const label = `${theme} ${from} to ${to}`;
        assert.deepEqual(next.compose?.theme, theme, label);
        assert.equal(next.compose?.seed, 5, label);
        assert.deepEqual(next.elements.filter((e) => e.type === "image").map((e) => e.mediaId).sort(), photos(9).map((p) => p.id).sort(), label);
        assert.equal(next.background.value, doc.background.value, label);
        for (const e of next.elements) {
          const b = boxOf(e);
          assert.ok(b.l >= -1 && b.r <= FORMATS[to].width * slideCount + 1 && b.t >= -1 && b.b <= FORMATS[to].height + 1, `${label}: ${e.type} outside`);
        }
      }
    }
  });
  it("a photo that no longer fits the slides is an error, not a loss", () => {
    const { doc } = made(6, "scrapbook");
    const extras: Element[] = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, type: "image", x: i, y: 0, w: 400, h: 300, rotation: 0, locked: false, mediaId: `more${i}` }));
    assert.throws(() => changeFormat({ ...doc, elements: [...doc.elements, ...extras] }, { from: "portrait_4_5", to: "square", slideCount: 2 }), /don't fit/);
  });
});

describe("changing the format in the editor store", () => {
  const S = () => useEditor.getState();
  const project = (doc: Doc, slideCount: number): Project => ({ id: "p1", title: "T", format: "portrait_4_5", slideCount, rev: 0, updatedAt: new Date().toISOString(), doc });

  it("sets the format and document together, clears the selection, marks the project unsaved, and undo goes back", () => {
    const doc = plain();
    S().load(project(doc, 2));
    S().select("a");
    S().updateElement("a", { x: 99 });
    assert.equal(S().past.length, 1);
    const next = changeFormat(S().doc, { from: "portrait_4_5", to: "square", slideCount: 2 });
    S().setFormat("square", next);
    assert.equal(S().format, "square");
    assert.deepEqual(S().doc, next);
    assert.equal(S().selectedId, null);
    assert.equal(S().saveStatus, "unsaved");
    assert.equal(S().past.length, 2);
    S().undo();
    assert.equal(S().format, "portrait_4_5", "undo goes back to the old shape as well as the old layout");
    assert.equal(S().doc.elements.find((e) => e.id === "a")!.x, 99);
    assert.equal(S().doc.elements.find((e) => e.id === "a")!.y, doc.elements[0].y);
    S().redo();
    assert.equal(S().format, "square");
    assert.deepEqual(S().doc, next);
  });
  it("edits made afterwards are their own steps, even right after an edit with the same key", () => {
    S().load(project(plain(), 2));
    S().updateElement("a", { x: 1 }, { key: "move" });
    S().setFormat("story_9_16", changeFormat(S().doc, { from: "portrait_4_5", to: "story_9_16", slideCount: 2 }));
    S().updateElement("a", { x: 2 }, { key: "move" });
    assert.equal(S().past.length, 3, "not folded into the step from before the change");
    S().undo();
    assert.equal(S().doc.elements.find((e) => e.id === "a")!.x, 1);
    assert.equal(S().format, "story_9_16");
    S().undo();
    assert.equal(S().format, "portrait_4_5");
  });
});
