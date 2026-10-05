import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanText, ComposePlanSchema, contrast, FALLBACK_PLAN, inkFor, layoutCarousel, slidesFor, type ComposePlan, type LayoutPhoto } from "@/lib/compose";
import { DocSchema, type Element } from "@/lib/doc";
import { FORMATS } from "@/lib/formats";
import { composeInput } from "@/server/schemas";
import { parseSticker, STICKERS } from "@/lib/stickers";

const W = FORMATS.portrait_4_5.width;
const H = FORMATS.portrait_4_5.height;
const counter = () => {
  let n = 0;
  return () => `el-${++n}`;
};
const photo = (i: number, over: Partial<LayoutPhoto> = {}): LayoutPhoto => ({ id: `p${i}`, width: 4000, height: 3000, ...over });
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(i));
const plan = (over: Partial<ComposePlan> = {}): ComposePlan => ({ ...FALLBACK_PLAN, ...over });
const run = (ps: LayoutPhoto[], p: ComposePlan = plan(), over: Partial<Parameters<typeof layoutCarousel>[2]> = {}) =>
  layoutCarousel(ps, p, { format: "portrait_4_5", maxSlides: 10, seed: 1, newId: counter(), ...over });
const images = (els: Element[]) => els.filter((e) => e.type === "image");
const slideOf = (e: Element) => Math.floor((e.x + e.w / 2) / W);

describe("how many slides", () => {
  it("is about three photos each, at most five, at least one", () => {
    const got = [1, 2, 3, 4, 5, 6, 7, 10, 16, 30].map((n) => slidesFor(n, 10));
    assert.deepEqual(got, [1, 1, 1, 2, 2, 2, 3, 4, 6, 10]);
  });
  it("refuses more photos than the plan has room for, instead of cutting some", () => {
    assert.throws(() => slidesFor(31, 10));
    assert.equal(slidesFor(30, 10), 10);
    assert.throws(() => run(photos(0)), /at least one/);
  });
});

describe("layoutCarousel", () => {
  it("is the same for the same seed and different for another", () => {
    const a = run(photos(8), plan(), { seed: 5 });
    assert.deepEqual(a, run(photos(8), plan(), { seed: 5 }));
    assert.notDeepEqual(a.doc.elements, run(photos(8), plan(), { seed: 6 }).doc.elements);
  });

  it("uses every photo exactly once, inside the artboard, for 1 to 30 photos in every style", () => {
    for (const style of ["scrapbook", "editorial", "clean"] as const) {
      for (let n = 1; n <= 30; n++) {
        const { doc, slideCount } = run(photos(n), plan({ style, title: "summer", captions: ["a", "b"] }));
        assert.ok(DocSchema.safeParse(doc).success, `${style} ${n}`);
        const imgs = images(doc.elements);
        assert.deepEqual(imgs.map((e) => e.mediaId).sort(), photos(n).map((p) => p.id).sort(), `${style} ${n}`);
        assert.equal(slideCount, slidesFor(n, 10));
        for (const e of doc.elements) {
          assert.ok(e.x >= 0 && e.x + e.w <= W * slideCount, `${style} ${n} ${e.id} sideways`);
          assert.ok(e.y >= 0 && e.y + e.h <= H + 1, `${style} ${n} ${e.id} vertical`);
        }
      }
    }
  });

  it("gives slides equal shares, early slides one more, and keeps the picked order across slides", () => {
    const { doc, slideCount } = run(photos(7));
    assert.equal(slideCount, 3);
    const bySlide = [0, 1, 2].map((s) => images(doc.elements).filter((e) => slideOf(e) === s).map((e) => e.mediaId).sort());
    assert.deepEqual(bySlide, [["p0", "p1", "p2"], ["p3", "p4"], ["p5", "p6"]]);
  });

  it("crops every photo to its box without squashing it", () => {
    const mixed = [photo(0, { width: 6000, height: 2000 }), photo(1, { width: 2000, height: 6000 }), photo(2, { width: 3000, height: 3000 }), photo(3, { width: 4032, height: 3024 })];
    for (const style of ["scrapbook", "editorial"] as const) {
      for (const e of images(run(mixed, plan({ style })).doc.elements)) {
        const src = mixed.find((p) => p.id === e.mediaId)!;
        const shown = (e.crop!.w * src.width) / (e.crop!.h * src.height);
        assert.ok(Math.abs(shown - e.w / e.h) < 0.01, `${style} ${e.mediaId}`);
      }
    }
  });

  it("puts a wide photo in the wide box and tall photos in the small ones", () => {
    const set = [photo(0, { width: 2000, height: 3000 }), photo(1, { width: 4800, height: 2700 }), photo(2, { width: 2000, height: 3000 })];
    const imgs = images(run(set, plan({ style: "editorial" })).doc.elements);
    const wide = imgs.find((e) => e.mediaId === "p1")!;
    assert.ok(imgs.every((e) => e === wide || e.w < wide.w));
  });

  it("lets the right-most photo of every slide but the last run over the edge into the next", () => {
    const { doc, slideCount } = run(photos(12));
    for (let s = 0; s < slideCount - 1; s++) {
      const here = images(doc.elements).filter((e) => slideOf(e) === s);
      assert.ok(here.some((e) => e.x + e.w > (s + 1) * W + 20), `slide ${s}`);
    }
    const last = images(doc.elements).filter((e) => slideOf(e) === slideCount - 1);
    assert.ok(last.every((e) => e.x + e.w <= W * slideCount));
  });

  it("shows the hero photo biggest in its slide, and only the first one flagged", () => {
    const tags = { subject: "", mood: "", palette: ["#808080"], focus: { x: 0.5, y: 0.5 } };
    const ps = [photo(0), photo(1, { tags: { ...tags, hero: true } }), photo(2), photo(3, { tags: { ...tags, hero: true } }), photo(4), photo(5)];
    const imgs = images(run(ps, plan({ style: "editorial" })).doc.elements);
    const area = (id: string) => imgs.filter((e) => e.mediaId === id).map((e) => e.w * e.h)[0];
    assert.equal(area("p1"), Math.max(area("p0"), area("p1"), area("p2")));
    // p3 was flagged too but only the first flag counts, so it is not forced into the big box
    const slide2 = imgs.filter((e) => slideOf(e) === 1);
    assert.ok(slide2.length === 3);
  });

  it("centres each crop on the focus point the model gave", () => {
    const tags = (x: number) => ({ subject: "", mood: "", palette: ["#808080"], focus: { x, y: 0.5 } });
    // Panoramas are cropped left and right to fit, so the focus point decides which part stays.
    const ps = [photo(0, { width: 6000, height: 2000, tags: tags(0.1) }), photo(1, { width: 6000, height: 2000, tags: tags(0.9) })];
    const imgs = images(run(ps, plan({ style: "editorial" })).doc.elements);
    const left = imgs.find((e) => e.mediaId === "p0")!;
    const right = imgs.find((e) => e.mediaId === "p1")!;
    assert.equal(left.crop!.x, 0);
    assert.ok(right.crop!.x > 0.3 && right.crop!.x + right.crop!.w <= 1.0001);
  });

  it("styles: scrapbook tilts, outlines and torn-edges some photos; editorial is square and flat; clean is rounded", () => {
    const sc = images(run(photos(9), plan({ style: "scrapbook" })).doc.elements);
    assert.ok(sc.every((e) => Math.abs(e.rotation) <= 4) && sc.some((e) => e.rotation !== 0));
    assert.ok(sc.every((e) => e.outline?.color === "#ffffff" && e.shadow));
    assert.ok(sc.some((e) => e.mask?.shape === "torn" && typeof e.mask.seed === "number"));
    const ed = images(run(photos(9), plan({ style: "editorial" })).doc.elements);
    assert.ok(ed.every((e) => e.rotation === 0 && !e.outline && !e.shadow && e.mask?.shape === "rect"));
    const cl = images(run(photos(9), plan({ style: "clean" })).doc.elements);
    assert.ok(cl.every((e) => e.rotation === 0 && e.mask?.shape === "rounded" && !e.outline));
  });

  it("editorial and clean photos never overlap each other", () => {
    for (const style of ["editorial", "clean"] as const) {
      const { doc, slideCount } = run(photos(15), plan({ style }));
      for (let s = 0; s < slideCount; s++) {
        const here = images(doc.elements).filter((e) => slideOf(e) === s).filter((e) => e.x + e.w <= (s + 1) * W + 1);
        for (const a of here) for (const b of here) {
          if (a === b) continue;
          const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          assert.ok(apart, `${style} slide ${s}`);
        }
      }
    }
  });

  it("puts at most one line of text on a slide, spread out, and keeps photos clear of it", () => {
    const { doc, slideCount } = run(photos(12), plan({ title: "summer", captions: ["one", "two", "three"] }));
    const texts = doc.elements.filter((e) => e.type === "text");
    assert.equal(texts.length, 4);
    assert.equal(new Set(texts.map((t) => slideOf(t))).size, 4);
    assert.equal(slideOf(texts[0]), 0);
    assert.equal(texts[0].text!.value, "summer");
    assert.ok(slideCount >= 4);
    for (const t of texts) {
      for (const e of images(doc.elements).filter((e) => slideOf(e) === slideOf(t))) assert.ok(e.y + e.h <= t.y + 1, "a photo runs into the caption");
      assert.ok(t.y + t.h <= H + 1);
    }
  });

  it("drops captions that don't have a slide to sit on, title first", () => {
    const { doc } = run(photos(2), plan({ title: "t", captions: ["a", "b", "c"] }));
    assert.deepEqual(doc.elements.filter((e) => e.type === "text").map((e) => e.text!.value), ["t"]);
  });

  it("text is always readable: on the paper label in scrapbook, on the background otherwise", () => {
    for (const [background, ink] of [["#ffffff", "#ffffff"], ["#111111", "#222222"], ["#f4f1ea", "#2b2b2b"], ["#336699", "#3a6a9c"]]) {
      const ed = run(photos(3), plan({ style: "editorial", background, ink, captions: ["hi"] })).doc.elements.find((e) => e.type === "text")!;
      assert.ok(contrast(background, ed.text!.color) >= 3, `editorial ${background} ${ink}`);
      const sc = run(photos(3), plan({ style: "scrapbook", background, ink, captions: ["hi"] })).doc.elements.find((e) => e.type === "text")!;
      assert.ok(contrast("#ecebe5", sc.text!.color) >= 3, `scrapbook ${background} ${ink}`);
    }
  });

  it("long titles shrink to fit one row instead of running off the slide", () => {
    const t = run(photos(3), plan({ title: "x".repeat(40) })).doc.elements.find((e) => e.type === "text")!;
    assert.ok(t.text!.size >= 30 && t.text!.size < 84);
    assert.ok(t.h <= 0.11 * H + 40);
  });

  it("the pattern follows the plan and sits close to the background colour", () => {
    assert.equal(run(photos(3), plan({ pattern: "none" })).doc.pattern, undefined);
    const g = run(photos(3), plan({ pattern: "grid", background: "#f4f1ea", ink: "#2b2b2b" })).doc.pattern!;
    assert.equal(g.kind, "grid");
    assert.ok(g.color !== "#f4f1ea" && contrast("#f4f1ea", g.color) < 1.6, "the grid should stay quiet");
    assert.equal(run(photos(3), plan({ pattern: "dots" })).doc.pattern!.kind, "dots");
  });

  it("works for every format", () => {
    for (const format of ["portrait_4_5", "portrait_3_4", "square", "story_9_16"] as const) {
      const { doc, slideCount } = run(photos(10), plan({ title: "t" }), { format });
      const f = FORMATS[format];
      for (const e of doc.elements) assert.ok(e.x >= 0 && e.x + e.w <= f.width * slideCount && e.y + e.h <= f.height + 1, format);
    }
  });
});

describe("what the model is allowed to say", () => {
  const ok = { style: "scrapbook", background: "#f4f1ea", pattern: "grid", ink: "#2b2b2b", font: "caveat", captions: ["me and coffee"] };
  it("accepts a normal plan", () => assert.ok(ComposePlanSchema.safeParse(ok).success));
  it("refuses colours that aren't hex, fonts that aren't on the list, unknown styles, too many or too long captions", () => {
    for (const bad of [{ background: "red" }, { ink: "#fff" }, { font: "comic-sans" }, { style: "neon" }, { pattern: "stripes" }, { captions: Array(7).fill("x") }, { captions: ["x".repeat(41)] }, { captions: [""] }, { title: "x".repeat(41) }]) {
      assert.ok(!ComposePlanSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad));
    }
  });
  it("flattens line breaks and control characters in text, so nothing hidden rides along", () => {
    assert.equal(cleanText("a\nb\u0000c\u2028d   e"), "a b c d e");
    const parsed = ComposePlanSchema.parse({ ...ok, captions: ["line one\nline two\u0007"] });
    assert.equal(parsed.captions[0], "line one line two");
  });
  it("ink: keeps a readable preference, replaces an unreadable one", () => {
    assert.equal(inkFor("#ffffff", "#222222"), "#222222");
    assert.equal(inkFor("#ffffff", "#ffffff"), "#111111");
    assert.equal(inkFor("#101010", "#202020"), "#ffffff");
  });
});

describe("the compose request", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  it("takes 1 to 30 photo ids and nothing else odd", () => {
    assert.ok(composeInput.safeParse({ mediaIds: [id(1)] }).success);
    assert.ok(composeInput.safeParse({ mediaIds: Array.from({ length: 30 }, (_, i) => id(i)), format: "square", title: "Trip", seed: 4 }).success);
    for (const bad of [{ mediaIds: [] }, { mediaIds: Array.from({ length: 31 }, (_, i) => id(i)) }, { mediaIds: ["nope"] }, { mediaIds: [id(1)], format: "a4" }, { mediaIds: [id(1)], seed: -1 }, { mediaIds: [id(1)], seed: 1.5 }, {}]) {
      assert.ok(!composeInput.safeParse(bad).success, JSON.stringify(bad));
    }
  });
});

describe("decorations", () => {
  const stickers = (els: Element[]) => els.filter((e) => e.type === "sticker");
  const kind = (e: Element) => parseSticker(e.assetPath)!;
  /** Elements turn about their top-left corner, so the middle of a turned one isn't the middle of its box. */
  const visualCentre = (e: Element): [number, number] => {
    const r = (e.rotation * Math.PI) / 180;
    return [e.x + (e.w / 2) * Math.cos(r) - (e.h / 2) * Math.sin(r), e.y + (e.w / 2) * Math.sin(r) + (e.h / 2) * Math.cos(r)];
  };
  const doodle = (e: Element) => !["tape", "tape-stripe", "label"].includes(kind(e));

  it("scrapbook gets tape and doodles on every slide, all built-in, all coloured", () => {
    const { doc, slideCount } = run(photos(9), plan({ style: "scrapbook" }));
    for (let s = 0; s < slideCount; s++) {
      const here = stickers(doc.elements).filter((e) => slideOf(e) === s);
      assert.ok(here.some((e) => kind(e).startsWith("tape")), `slide ${s} has tape`);
      assert.ok(here.filter(doodle).length >= 1, `slide ${s} has a doodle`);
      assert.ok(here.length <= 6);
    }
    for (const e of stickers(doc.elements)) {
      assert.ok(parseSticker(e.assetPath), String(e.assetPath));
      assert.match(e.tint ?? "", /^#[0-9a-f]{6}$/i);
      assert.equal(e.name, STICKERS[kind(e)].label);
      assert.equal(Math.round((e.w / e.h) * 10) / 10, Math.round(STICKERS[kind(e)].aspect * 10) / 10, "keeps its shape");
    }
  });

  it("editorial and clean stay free of decorations", () => {
    for (const style of ["editorial", "clean"] as const) assert.equal(stickers(run(photos(9), plan({ style, title: "t" })).doc.elements).length, 0);
  });

  it("can be switched off", () => {
    assert.equal(stickers(run(photos(9), plan(), { decorations: false }).doc.elements).length, 0);
    const t = run(photos(3), plan({ title: "hello" }), { decorations: false }).doc.elements.find((e) => e.type === "text")!;
    assert.ok(t.text!.color && !stickers(run(photos(3), plan({ title: "hello" }), { decorations: false }).doc.elements).length);
  });

  it("puts each caption on one paper label, with the text in the middle of it", () => {
    const { doc, slideCount } = run(photos(9), plan({ title: "summer", captions: ["slow mornings", "good light"] }));
    const texts = doc.elements.filter((e) => e.type === "text");
    assert.equal(texts.length, 3);
    for (const t of texts) {
      const labels = stickers(doc.elements).filter((e) => kind(e) === "label" && slideOf(e) === slideOf(t));
      assert.equal(labels.length, 1);
      const [l] = labels;
      const [lx, ly] = visualCentre(l);
      const [tx, ty] = visualCentre(t);
      assert.ok(Math.hypot(lx - tx, ly - ty) < 8, "text is in the middle of its label");
      assert.ok(t.w < l.w && t.h < l.h);
      assert.equal(t.rotation, l.rotation);
    }
    assert.ok(slideCount >= 3);
  });

  it("keeps doodles above the caption label", () => {
    const { doc } = run(photos(9), plan({ captions: ["a", "b", "c"], title: "t" }));
    const withText = new Set(doc.elements.filter((e) => e.type === "text").map(slideOf));
    for (const e of stickers(doc.elements).filter(doodle)) {
      if (withText.has(slideOf(e))) assert.ok(e.y + e.h <= H * 0.9, `${kind(e)} sits over the label`);
    }
  });

  it("tape is stuck to a photo", () => {
    const { doc } = run(photos(9));
    for (const t of stickers(doc.elements).filter((e) => kind(e).startsWith("tape"))) {
      const cx = t.x + t.w / 2;
      const cy = t.y + t.h / 2;
      const near = images(doc.elements).some((p) => cx > p.x - t.w && cx < p.x + p.w + t.w && cy > p.y - t.w && cy < p.y + p.h + t.w);
      assert.ok(near);
    }
  });

  it("doesn't pile decorations into one spot on a slide", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { doc, slideCount } = run(photos(9), plan(), { seed });
      for (let s = 0; s < slideCount; s++) {
        const here = stickers(doc.elements).filter((e) => slideOf(e) === s && kind(e) !== "label");
        for (const a of here) for (const b of here) {
          if (a === b) continue;
          const [ax, ay] = visualCentre(a);
          const [bx, by] = visualCentre(b);
          const apart = Math.hypot(ax - bx, ay - by);
          assert.ok(apart > 70, `seed ${seed} slide ${s}: ${kind(a)} and ${kind(b)} sit ${Math.round(apart)}px apart`);
        }
      }
    }
  });

  it("is the same for the same seed", () => {
    assert.deepEqual(run(photos(9), plan(), { seed: 4 }), run(photos(9), plan(), { seed: 4 }));
  });
});
