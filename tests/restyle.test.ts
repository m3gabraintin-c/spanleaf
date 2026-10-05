import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutCarousel, type LayoutPhoto } from "@/lib/compose";
import { DocSchema, type Doc, type Element } from "@/lib/doc";
import { FORMATS } from "@/lib/formats";
import { ComposeMetaSchema, FALLBACK_PLAN, type ComposePlan } from "@/lib/plan";
import { restyleDoc } from "@/lib/restyle";
import { customise, resolveTheme, THEME_IDS, THEMES } from "@/lib/themes";
import { useEditor } from "@/editor/store";
import type { Project } from "@/data/types";
import { boxOf, centreOf } from "./layout-checks";

const W = FORMATS.portrait_4_5.width;
const H = FORMATS.portrait_4_5.height;
/** Photos of clearly different shapes, so rounding a shape back from a crop can't change which box each gets. */
const SHAPES = [[4000, 3000], [3000, 4000], [6000, 2000], [3000, 3000], [2000, 5000], [4800, 2700], [3500, 3000], [2500, 4000], [5200, 2600], [3200, 3600]];
const photos = (n: number): LayoutPhoto[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, width: SHAPES[i % SHAPES.length][0] + 37 * i, height: SHAPES[i % SHAPES.length][1], name: `photo-${i}.jpg` }));
const plan = (over: Partial<ComposePlan> = {}): ComposePlan => ({ ...FALLBACK_PLAN, title: "summer", captions: ["slow mornings"], ...over });
const made = (n: number, over: Partial<ComposePlan> = {}, seed = 7) => {
  const out = layoutCarousel(photos(n), plan(over), { format: "portrait_4_5", maxSlides: 10, seed, theme: over.theme });
  return { doc: out.doc, slideCount: out.slideCount };
};
const args = (slideCount: number, over: Partial<Parameters<typeof restyleDoc>[1]> = {}) => ({ format: "portrait_4_5" as const, slideCount, theme: "scrapbook" as const, seed: 7, ...over });
const images = (d: Doc) => d.elements.filter((e) => e.type === "image");
const ids = (d: Doc) => images(d).map((e) => e.mediaId).sort();
const slideOf = (e: Element) => Math.floor(centreOf(e)[0] / W);
const strip = (e: Element) => {
  const { id: _id, crop: _crop, ...rest } = e;
  return rest;
};
const ownLook = (b: ReturnType<typeof resolveTheme>) => ({ background: b.palette.background, ink: b.palette.ink, pattern: b.palette.pattern, font: b.font });

describe("restyleDoc", () => {
  it("gives the same layout back for the same theme and seed (crops may differ by rounding)", () => {
    for (const id of THEME_IDS) {
      const { doc, slideCount } = made(8, { theme: id });
      const again = restyleDoc(doc, args(slideCount, { theme: id }))!;
      assert.deepEqual(again.elements.map(strip), doc.elements.map(strip), id);
      images(doc).forEach((e, i) => {
        const c = images(again)[i].crop!;
        assert.ok(Math.abs(c.x - e.crop!.x) < 0.01 && Math.abs(c.y - e.crop!.y) < 0.01 && Math.abs(c.w - e.crop!.w) < 0.01 && Math.abs(c.h - e.crop!.h) < 0.01, `${id} crop ${i}`);
      });
    }
  });

  it("moves between any two themes, keeping every photo, the slide count and the saved details", () => {
    for (const from of THEME_IDS) {
      const { doc, slideCount } = made(11, { theme: from });
      for (const to of THEME_IDS) {
        const next = restyleDoc(doc, args(slideCount, { theme: to, seed: 99 }))!;
        assert.deepEqual(ids(next), ids(doc), `${from} to ${to}`);
        assert.equal(next.compose?.theme, to);
        assert.equal(next.compose?.seed, 99);
        assert.deepEqual(next.compose?.plan, doc.compose?.plan);
        assert.deepEqual(next.compose?.tags, doc.compose?.tags);
        assert.ok(DocSchema.safeParse(next).success);
        for (const e of next.elements) {
          const b = boxOf(e);
          assert.ok(b.l >= -1 && b.r <= W * slideCount + 1 && b.t >= -1 && b.b <= H + 1, `${from} to ${to}: ${e.type} outside`);
        }
        assert.equal(images(next).filter((e) => slideOf(e) >= slideCount).length, 0);
        assert.equal(next.background.value, THEMES[to].palette.adapt ? doc.compose!.plan.background : THEMES[to].palette.background, `${from} to ${to} background`);
      }
    }
  });

  it("another seed shuffles tilt and torn edges", () => {
    const { doc, slideCount } = made(9);
    const a = restyleDoc(doc, args(slideCount, { seed: 1 }))!;
    const b = restyleDoc(doc, args(slideCount, { seed: 2 }))!;
    assert.notDeepEqual(a.elements.map(strip), b.elements.map(strip));
  });

  it("applies a custom theme and saves it whole", () => {
    const { doc, slideCount } = made(6);
    const base = resolveTheme("scrapbook");
    const custom = customise(base, { tilt: 0, edges: "oval", decorations: "none", border: false }, ownLook(base));
    const next = restyleDoc(doc, args(slideCount, { theme: custom }))!;
    assert.deepEqual(next.compose?.theme, custom);
    assert.ok(images(next).every((e) => e.rotation === 0 && e.mask?.shape === "ellipse" && !e.outline));
    assert.deepEqual([...new Set(next.elements.filter((e) => e.type === "sticker").map((e) => e.assetPath))], ["builtin:label"], "only the caption labels are left");
  });

  it("keeps the order the person gave, wherever the photos have been dragged to", () => {
    const { doc, slideCount } = made(9);
    const jumbled: Doc = { ...doc, elements: doc.elements.map((e) => (e.mediaId === "p0" ? { ...e, x: W * slideCount - 400 } : e)) };
    const next = restyleDoc(jumbled, args(slideCount))!;
    assert.equal(slideOf(images(next).find((e) => e.mediaId === "p0")!), 0, "p0 was first, so it goes first");
    const reordered: Doc = { ...doc, compose: { ...doc.compose!, order: [...doc.compose!.order].reverse() } };
    const rev = restyleDoc(reordered, args(slideCount))!;
    assert.equal(slideOf(images(rev).find((e) => e.mediaId === "p8")!), 0);
    assert.equal(slideOf(images(rev).find((e) => e.mediaId === "p0")!), slideCount - 1);
    assert.deepEqual(rev.compose?.order, [...doc.compose!.order].reverse());
  });

  it("leaves out a photo that was removed, and the slide count stays", () => {
    const { doc, slideCount } = made(9);
    const gone: Doc = { ...doc, elements: doc.elements.filter((e) => e.mediaId !== "p4") };
    const next = restyleDoc(gone, args(slideCount))!;
    assert.deepEqual(ids(next), ids(doc).filter((id) => id !== "p4"));
    assert.ok(!next.compose!.order.includes("p4"));
  });

  it("includes a photo that was added by hand, last, and reads its shape from its box", () => {
    const { doc, slideCount } = made(5);
    const extra: Element = { id: "hand", type: "image", x: 10, y: 10, w: 800, h: 400, rotation: 0, locked: false, mediaId: "added" };
    const next = restyleDoc({ ...doc, elements: [...doc.elements, extra] }, args(slideCount))!;
    assert.deepEqual(ids(next), [...ids(doc), "added"].sort());
    assert.deepEqual(next.compose?.order.at(-1), "added");
    const el = images(next).find((e) => e.mediaId === "added")!;
    assert.ok(Math.abs((el.crop!.w * 2000) / (el.crop!.h * 1000) / (el.w / el.h) - 1) < 0.01, "cropped as a 2 to 1 photo, so not squashed");
  });

  it("with fewer photos than slides the last slides are left empty", () => {
    const { doc } = made(9);
    const few: Doc = { ...doc, elements: doc.elements.filter((e) => !["p0", "p1", "p2", "p3", "p4", "p5"].includes(e.mediaId ?? "")) };
    const next = restyleDoc(few, args(3))!;
    assert.deepEqual(ids(next), ["p6", "p7", "p8"]);
    assert.deepEqual(images(next).map(slideOf).sort(), [0, 1, 2]);
  });

  it("refuses photos that won't fit the slides, rather than losing some", () => {
    const { doc } = made(6);
    const extras: Element[] = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, type: "image", x: i, y: 0, w: 400, h: 300, rotation: 0, locked: false, mediaId: `more${i}` }));
    assert.throws(() => restyleDoc({ ...doc, elements: [...doc.elements, ...extras] }, args(4)), /don't fit/);
  });

  it("returns null for a document that wasn't made from photos, or has none left", () => {
    const { doc } = made(3);
    const { compose: _c, ...plain } = doc;
    assert.equal(restyleDoc(plain as Doc, args(1)), null);
    assert.equal(restyleDoc({ ...doc, elements: doc.elements.filter((e) => e.type !== "image") }, args(1)), null);
    assert.equal(restyleDoc({ v: 1, background: { type: "color", value: "#ffffff" }, elements: [] }, args(1)), null);
  });

  it("puts the plan's title and captions back, and drops text and stickers the person added", () => {
    const { doc, slideCount } = made(6);
    const edited: Doc = {
      ...doc,
      elements: [
        ...doc.elements.map((e) => (e.type === "text" ? { ...e, text: { ...e.text!, value: "my own words" } } : e)),
        { id: "mine", type: "text", x: 10, y: 10, w: 300, h: 80, rotation: 0, locked: false, text: { value: "extra", font: "inter", size: 40, color: "#000000", align: "left", bold: false } },
      ],
    };
    const next = restyleDoc(edited, args(slideCount))!;
    assert.deepEqual(next.elements.filter((e) => e.type === "text").map((e) => e.text!.value), ["summer", "slow mornings"]);
    assert.ok(!next.elements.some((e) => e.id === "mine"));
  });

  it("uses the format it is given", () => {
    const { doc, slideCount } = made(6);
    const next = restyleDoc(doc, args(slideCount, { format: "square" }))!;
    for (const e of next.elements) assert.ok(boxOf(e).r <= 1080 * slideCount + 1 && boxOf(e).b <= 1080 + 1);
  });

  it("doesn't change the document it was given", () => {
    const { doc, slideCount } = made(7);
    const frozen = structuredClone(doc);
    restyleDoc(doc, args(slideCount, { theme: "film", seed: 5 }));
    assert.deepEqual(doc, frozen);
  });

  it("a full 20-slide, 100-photo carousel restyles and still fits the saved-document size limit", () => {
    const tag = { subject: "a".repeat(60), mood: "b".repeat(40), palette: ["#112233", "#445566", "#778899", "#aabbcc"], focus: { x: 0.5, y: 0.5 } };
    const big = layoutCarousel(Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}-${"x".repeat(30)}`, width: 4000, height: 3000, tags: tag })), plan({ captions: Array(6).fill("x".repeat(40)) }), { format: "portrait_4_5", maxSlides: 20, theme: "scrapbook" });
    assert.equal(big.slideCount, 20);
    assert.ok(JSON.stringify(big.doc).length < 700 * 1024, `${JSON.stringify(big.doc).length} bytes`);
    const next = restyleDoc(big.doc, args(20, { theme: "dreamy" }))!;
    assert.equal(images(next).length, 100);
    assert.ok(JSON.stringify(next).length < 2 * 1024 * 1024);
  });
});

describe("saved layout details", () => {
  const meta = made(4).doc.compose!;
  it("round-trips, and unknown fields are dropped", () => {
    assert.deepEqual(ComposeMetaSchema.parse(meta), meta);
    assert.ok(!("extra" in ComposeMetaSchema.parse({ ...meta, extra: 1 })));
  });
  it("refuses a bad seed, theme, plan, note, id or size", () => {
    const tag = { subject: "", mood: "", palette: ["#888888"], focus: { x: 0.5, y: 0.5 } };
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`id${i}`, tag]));
    for (const bad of [
      { seed: -1 }, { seed: 1.5 }, { seed: 1_000_001 }, { theme: "neon" }, { theme: { name: "x" } }, { plan: { ...meta.plan, theme: "neon" } },
      { tags: { p0: { ...tag, focus: { x: 2, y: 0 } } } }, { tags: { "": tag } }, { tags: { ["x".repeat(65)]: tag } }, { tags: many(101) }, { order: [""] }, { order: Array(101).fill("a") },
    ]) {
      assert.ok(!ComposeMetaSchema.safeParse({ ...meta, ...bad }).success, JSON.stringify(bad).slice(0, 80));
    }
    assert.ok(ComposeMetaSchema.safeParse({ ...meta, tags: many(100), order: Array(100).fill("a") }).success);
  });
  it("a document made without photos still parses with no compose block", () => {
    assert.ok(DocSchema.safeParse({ v: 1, background: { type: "color", value: "#ffffff" }, elements: [] }).success);
  });
});

describe("restyling through the editor store", () => {
  const S = () => useEditor.getState();
  const project = (doc: Doc): Project => ({ id: "p1", title: "T", format: "portrait_4_5", slideCount: 3, rev: 0, updatedAt: new Date().toISOString(), doc });

  it("is one undo step: undo brings back the exact earlier layout, redo the new one", () => {
    const { doc, slideCount } = made(8);
    S().load({ ...project(doc), slideCount });
    const before = structuredClone(S().doc);
    S().select(S().doc.elements[0].id);
    const next = restyleDoc(S().doc, args(slideCount, { theme: "film", seed: 3 }))!;
    S().replaceDoc(next);
    assert.equal(S().selectedId, null);
    assert.equal(S().saveStatus, "unsaved");
    assert.equal(S().docVersion, 1);
    assert.equal(S().past.length, 1);
    assert.deepEqual(S().doc, next);
    S().undo();
    assert.deepEqual(S().doc, before);
    S().redo();
    assert.deepEqual(S().doc, next);
  });

  it("quick changes with the same key share one undo step, and a different key starts another", () => {
    const { doc, slideCount } = made(6);
    S().load({ ...project(doc), slideCount });
    const first = restyleDoc(S().doc, args(slideCount, { seed: 1 }))!;
    const second = restyleDoc(first, args(slideCount, { seed: 2 }))!;
    S().replaceDoc(first, "themes");
    S().replaceDoc(second, "themes");
    assert.equal(S().past.length, 1, "dragging a slider is not fifty undo steps");
    S().undo();
    assert.deepEqual(S().doc, doc);
  });
});
