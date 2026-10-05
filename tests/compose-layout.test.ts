import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrast, inkFor, mix } from "@/lib/colour";
import { layoutCarousel, slidesFor, type LayoutOptions, type LayoutPhoto } from "@/lib/compose";
import type { Element } from "@/lib/doc";
import { FORMATS, type FormatKey } from "@/lib/formats";
import { seeded } from "@/lib/geometry";
import { cleanText } from "@/lib/look";
import { CAPTION_FONTS, ComposePlanSchema, FALLBACK_PLAN, type ComposePlan, type PhotoTags } from "@/lib/plan";
import { parseSticker } from "@/lib/stickers";
import { customise, DECORATIONS, EDGES, CAPTIONS, resolveTheme, THEME_IDS, type Customisation, type Theme, type ThemeChoice } from "@/lib/themes";
import { composeInput } from "@/server/schemas";
import { boxOf, centreOf, checkLayout, hits } from "./layout-checks";

const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];
const W = FORMATS.portrait_4_5.width;
const counter = () => {
  let n = 0;
  return () => `el-${++n}`;
};
const photo = (i: number, over: Partial<LayoutPhoto> = {}): LayoutPhoto => ({ id: `p${i}`, width: 4000, height: 3000, ...over });
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(i));
const plan = (over: Partial<ComposePlan> = {}): ComposePlan => ({ ...FALLBACK_PLAN, ...over });
const opts = (over: Partial<LayoutOptions> = {}): LayoutOptions => ({ format: "portrait_4_5", maxSlides: 10, seed: 1, newId: counter(), ...over });
const run = (ps: LayoutPhoto[], p: ComposePlan = plan(), over: Partial<LayoutOptions> = {}) => layoutCarousel(ps, p, opts(over));
const images = (els: Element[]) => els.filter((e) => e.type === "image");
const slideOf = (e: Element) => Math.floor(centreOf(e)[0] / W);
const tags = (over: Partial<PhotoTags> = {}): PhotoTags => ({ subject: "", mood: "", palette: ["#808080"], focus: { x: 0.5, y: 0.5 }, ...over });
const ownLook = (b: Theme) => ({ background: b.palette.background, ink: b.palette.ink, pattern: b.palette.pattern, font: b.font });

describe("how many slides", () => {
  it("follows the theme's share, never more than five a slide, never more than the plan allows", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 10, 16, 30].map((n) => slidesFor(n, 3, 10)), [1, 1, 1, 2, 2, 2, 3, 4, 6, 10]);
    assert.deepEqual([1, 4, 5, 8, 30].map((n) => slidesFor(n, 4, 10)), [1, 1, 2, 2, 8]);
    assert.deepEqual([1, 3, 6, 30].map((n) => slidesFor(n, 1, 10)), [1, 3, 6, 10]);
    assert.equal(slidesFor(30, 2, 10), 10, "packs more in rather than refuse");
    assert.equal(slidesFor(50, 5, 10), 10);
    assert.equal(slidesFor(5, 5, 10), 1);
  });
  it("refuses only when even five a slide won't fit", () => {
    assert.throws(() => slidesFor(51, 3, 10), /don't fit/);
    assert.throws(() => run(photos(0)), /at least one/);
  });
  it("a fixed slide count is kept exactly, leaving unused slides empty", () => {
    const { doc, slideCount } = run(photos(2), plan({ captions: ["a", "b"] }), { slides: 5 });
    assert.equal(slideCount, 5);
    assert.deepEqual(images(doc.elements).map(slideOf).sort(), [0, 1]);
    assert.ok(doc.elements.every((e) => slideOf(e) <= 1), "nothing on the empty slides");
    assert.equal(doc.elements.filter((e) => e.type === "text").length, 2, "captions go only where photos are");
  });
  it("a fixed slide count refuses more photos than five a slide", () => {
    assert.throws(() => run(photos(21), plan(), { slides: 4 }), /don't fit/);
    assert.equal(run(photos(20), plan(), { slides: 4 }).slideCount, 4);
  });
});

describe("every built-in theme", () => {
  for (const id of THEME_IDS) {
    describe(id, () => {
      it("lays out 1 to 30 photos in every format, and all of it holds", () => {
        for (const format of FORMAT_KEYS) {
          for (let n = 1; n <= 30; n++) {
            const p = plan({ theme: id, title: "summer", captions: ["slow mornings", "good light"] });
            checkLayout(photos(n), p, opts({ format, theme: id }), `${id} ${format} ${n}`);
          }
        }
      });
      it("handles mixed shapes of photo, from panoramas to tall slivers", () => {
        const shapes = [[6000, 2000], [2000, 6000], [3000, 3000], [4032, 3024], [3024, 4032], [8000, 1600], [1600, 8000]];
        for (let n = 1; n <= 14; n++) {
          const ps = Array.from({ length: n }, (_, i) => photo(i, { width: shapes[i % shapes.length][0], height: shapes[i % shapes.length][1] }));
          checkLayout(ps, plan({ theme: id, title: "t" }), opts({ theme: id }), `${id} mixed ${n}`);
        }
      });
      it("is the same for the same seed and different for another", () => {
        const a = run(photos(8), plan(), { seed: 5, theme: id });
        assert.deepEqual(a, run(photos(8), plan(), { seed: 5, theme: id }));
        if (resolveTheme(id).tilt > 0 || resolveTheme(id).masks.some((m) => m.shape === "torn")) assert.notDeepEqual(a.doc.elements, run(photos(8), plan(), { seed: 6, theme: id }).doc.elements);
      });
    });
  }
});

describe("theme behaviour", () => {
  it("scrapbook looks like a scrapbook: tilted, bordered, torn, taped, doodled, on labels", () => {
    const { doc } = run(photos(9), plan({ title: "summer", captions: ["a", "b"] }), { theme: "scrapbook" });
    const imgs = images(doc.elements);
    assert.ok(imgs.some((e) => e.rotation !== 0) && imgs.some((e) => e.mask?.shape === "torn") && imgs.every((e) => e.outline?.color === "#ffffff"));
    const kinds = doc.elements.filter((e) => e.type === "sticker").map((e) => parseSticker(e.assetPath)!);
    assert.ok(kinds.some((k) => k.startsWith("tape")) && kinds.some((k) => k === "label") && kinds.some((k) => !k.startsWith("tape") && k !== "label"));
  });
  it("editorial, clean and film carry no stickers at all, and film's frames are thin", () => {
    for (const id of ["editorial", "clean", "film"] as const) assert.equal(run(photos(9), plan({ title: "t" }), { theme: id }).doc.elements.filter((e) => e.type === "sticker").length, 0, id);
    assert.ok(images(run(photos(6), plan(), { theme: "clean" }).doc.elements).every((e) => e.mask?.shape === "rounded"));
    assert.ok(images(run(photos(6), plan(), { theme: "film" }).doc.elements).every((e) => e.mask?.shape === "rect" && e.outline!.width === 4));
  });
  it("polaroid has tape and no doodles, with a thick frame", () => {
    const { doc } = run(photos(6), plan(), { theme: "polaroid" });
    assert.ok(images(doc.elements).every((e) => e.outline!.width === 22));
    const kinds = doc.elements.filter((e) => e.type === "sticker").map((e) => parseSticker(e.assetPath));
    assert.ok(kinds.length > 0 && kinds.every((k) => k === "tape"));
  });
  it("dreamy cuts photos round and pill-shaped and uses sparkles and hearts, never tape", () => {
    const { doc } = run(photos(9), plan(), { theme: "dreamy" });
    assert.deepEqual([...new Set(images(doc.elements).map((e) => e.mask!.shape))].sort(), ["ellipse", "rounded"]);
    const kinds = new Set(doc.elements.filter((e) => e.type === "sticker").map((e) => parseSticker(e.assetPath)));
    assert.ok([...kinds].every((k) => ["sparkle", "heart", "dots", "drop", "label"].includes(k!)));
  });
  it("film packs photos nearly edge to edge and four to a slide", () => {
    const { doc, slideCount } = run(photos(12), plan(), { theme: "film" });
    assert.equal(slideCount, 3);
    const first = images(doc.elements).filter((e) => slideOf(e) === 0);
    const covered = first.reduce((sum, e) => sum + e.w * e.h, 0) / (W * FORMATS.portrait_4_5.height);
    assert.ok(covered > 0.75, `covers ${covered}`);
  });

  it("themes that follow the photos use the model's colours and font, the others keep their own", () => {
    const p = plan({ background: "#abcdef", ink: "#102030", pattern: "dots", font: "caveat", captions: ["hi"] });
    for (const id of THEME_IDS) {
      const t = resolveTheme(id);
      const { doc } = run(photos(3), p, { theme: id });
      const text = doc.elements.find((e) => e.type === "text")!;
      assert.equal(doc.background.value, t.palette.adapt ? "#abcdef" : t.palette.background, id);
      assert.equal(doc.pattern?.kind ?? "none", t.palette.adapt ? "dots" : t.palette.pattern, id);
      assert.equal(text.text!.font, t.palette.adapt ? "caveat" : t.font, id);
    }
  });
  it("without a chosen theme it uses the one the model picked", () => {
    for (const id of THEME_IDS) {
      const { doc } = layoutCarousel(photos(6), plan({ theme: id }), { format: "portrait_4_5", maxSlides: 10, seed: 1 });
      assert.deepEqual(doc.compose?.theme, id);
      assert.equal(images(doc.elements)[0].outline?.width, resolveTheme(id).outline?.width);
    }
  });
  it("a chosen theme beats the model's pick", () => {
    const { doc } = layoutCarousel(photos(6), plan({ theme: "scrapbook" }), { format: "portrait_4_5", maxSlides: 10, seed: 1, theme: "film" });
    assert.equal(doc.compose?.theme, "film");
    assert.ok(images(doc.elements).every((e) => e.outline?.width === 4));
  });

  it("text is readable whatever colours the model picked: on the label in label themes, on the background otherwise", () => {
    for (const [background, ink] of [["#ffffff", "#ffffff"], ["#111111", "#222222"], ["#f4f1ea", "#2b2b2b"], ["#336699", "#3a6a9c"]]) {
      for (const id of THEME_IDS) {
        const t = resolveTheme(id);
        const text = run(photos(3), plan({ background, ink, captions: ["hi"] }), { theme: id }).doc.elements.find((e) => e.type === "text")!;
        const back = t.caption === "label" ? t.labelTint : t.palette.adapt ? background : t.palette.background;
        assert.ok(contrast(back, text.text!.color) >= 3, `${id} ${background} ${ink}`);
      }
    }
  });
  it("long captions shrink to fit instead of running off the slide", () => {
    for (const id of THEME_IDS) {
      const t = run(photos(3), plan({ title: "x".repeat(40) }), { theme: id }).doc.elements.find((e) => e.type === "text")!;
      assert.ok(t.text!.size >= 30 && t.text!.size <= 84, id);
    }
  });
  it("titles go on the first slide and captions follow, one to a slide, dropping what there is no room for", () => {
    const { doc } = run(photos(12), plan({ title: "summer", captions: ["one", "two", "three"] }), { theme: "editorial" });
    const texts = doc.elements.filter((e) => e.type === "text");
    assert.deepEqual(texts.map((t) => t.text!.value), ["summer", "one", "two", "three"]);
    assert.equal(slideOf(texts[0]), 0);
    assert.equal(new Set(texts.map(slideOf)).size, 4);
    const few = run(photos(2), plan({ title: "t", captions: ["a", "b", "c"] }), { theme: "editorial" }).doc.elements.filter((e) => e.type === "text");
    assert.deepEqual(few.map((t) => t.text!.value), ["t"]);
  });

  it("puts a wide photo in the wide box, and the hero in the biggest", () => {
    const set = [photo(0, { width: 2000, height: 3000 }), photo(1, { width: 4800, height: 2700 }), photo(2, { width: 2000, height: 3000 })];
    const imgs = images(run(set, plan(), { theme: "editorial" }).doc.elements);
    const wide = imgs.find((e) => e.mediaId === "p1")!;
    assert.ok(imgs.every((e) => e === wide || e.w < wide.w));
    // Two photos are flagged, but only the first flag counts. Slide 2's photos are all the same shape, so
    // without a flag the first of them gets the big box.
    const ps = [photo(0), photo(1, { tags: tags({ hero: true }) }), photo(2), photo(3), photo(4, { tags: tags({ hero: true }) }), photo(5)];
    const out = images(run(ps, plan(), { theme: "editorial" }).doc.elements);
    const area = (id: string) => out.filter((e) => e.mediaId === id).map((e) => e.w * e.h)[0];
    assert.equal(area("p1"), Math.max(area("p0"), area("p1"), area("p2")), "the flagged photo gets the big box");
    assert.ok(area("p1") > area("p0"));
    assert.equal(area("p3"), Math.max(area("p3"), area("p4"), area("p5")), "a second flag is ignored");
    assert.ok(area("p3") > area("p4"));
  });
  it("centres each crop on the focus point the model gave", () => {
    const ps = [photo(0, { width: 6000, height: 2000, tags: tags({ focus: { x: 0.1, y: 0.5 } }) }), photo(1, { width: 6000, height: 2000, tags: tags({ focus: { x: 0.9, y: 0.5 } }) })];
    const imgs = images(run(ps, plan(), { theme: "editorial" }).doc.elements);
    const left = imgs.find((e) => e.mediaId === "p0")!;
    const right = imgs.find((e) => e.mediaId === "p1")!;
    assert.equal(left.crop!.x, 0);
    assert.ok(right.crop!.x > 0.3 && right.crop!.x + right.crop!.w <= 1.0001);
  });

  it("lets the right-most photo of every slide but the last run over the edge, in every theme", () => {
    for (const id of THEME_IDS) {
      const { doc, slideCount } = run(photos(12), plan(), { theme: id });
      for (let s = 0; s < slideCount - 1; s++) {
        const here = images(doc.elements).filter((e) => slideOf(e) === s);
        assert.ok(here.some((e) => boxOf(e).r > (s + 1) * W + 5), `${id} slide ${s}`);
      }
    }
  });
  it("in a grid the photo that crosses an edge stops in the margin and never lands on the next slide's photos", () => {
    for (const id of ["editorial", "clean", "film"] as const) {
      const { doc, slideCount } = run(photos(20), plan(), { theme: id });
      const imgs = images(doc.elements);
      for (const a of imgs) for (const b of imgs) if (a !== b) assert.ok(!hits(boxOf(a), boxOf(b)), `${id} ${a.mediaId} ${b.mediaId}`);
      assert.ok(slideCount >= 5);
    }
  });
  it("with no bridge set nothing crosses an edge", () => {
    const flat = { ...resolveTheme("scrapbook"), bridge: 0 };
    const { doc, slideCount } = run(photos(12), plan(), { theme: flat });
    for (let s = 0; s < slideCount - 1; s++) assert.ok(images(doc.elements).filter((e) => slideOf(e) === s).every((e) => boxOf(e).r <= (s + 1) * W + 40));
  });
});

describe("tilt never pushes anything out of place", () => {
  it("at the biggest tilt, photos, tape, doodles and captions stay inside the artboard and clear of the caption", () => {
    for (const id of THEME_IDS) {
      const base = resolveTheme(id);
      const wild = customise(base, { tilt: 12, decorations: "lots", border: true }, ownLook(base));
      for (const n of [1, 2, 3, 4, 5, 9, 17, 30]) {
        for (const format of FORMAT_KEYS) checkLayout(photos(n), plan({ theme: id, title: "t", captions: ["a", "b", "c"] }), opts({ format, theme: wild }), `${id} tilt12 ${format} ${n}`);
      }
    }
  });
});

describe("custom themes", () => {
  const base = resolveTheme("scrapbook");

  it("every control on every base lays out cleanly", () => {
    const patches: Partial<Customisation>[] = [
      ...DECORATIONS.map((decorations) => ({ decorations })),
      ...EDGES.map((edges) => ({ edges })),
      ...CAPTIONS.map((caption) => ({ caption })),
      { border: false },
      { tilt: 0 },
      { tilt: 12 },
      { background: "#000000", pattern: "lines" },
      { background: "#ffffff", pattern: "dots" },
    ];
    for (const id of THEME_IDS) {
      const b = resolveTheme(id);
      for (const patch of patches) {
        const custom = customise(b, patch, ownLook(b));
        for (const n of [1, 3, 7, 12]) checkLayout(photos(n), plan({ title: "t", captions: ["a", "b"] }), opts({ theme: custom }), `${id} ${JSON.stringify(patch)} ${n}`);
      }
    }
  });
  it("a custom theme is saved in the document, whole", () => {
    const custom = customise(base, { tilt: 7 }, ownLook(base));
    assert.deepEqual(run(photos(4), plan(), { theme: custom }).doc.compose?.theme, custom);
  });
  it("a hand-made theme with unusual but allowed values works", () => {
    const odd: Theme = { ...base, layout: "tight", perSlide: 1, masks: [{ shape: "rounded", radius: 0.5 }], outline: { color: "#ff0000", width: 80 }, shadow: null, bridge: 0.2, caption: "label", captionTilt: 6, align: "right" };
    for (const n of [1, 2, 5, 10]) checkLayout(photos(n), plan({ title: "t", captions: ["a", "b"] }), opts({ theme: odd }), `odd ${n}`);
  });
});

describe("decorations that have nowhere to go", () => {
  it("a doodle is left out rather than piled onto another", () => {
    const base = resolveTheme("scrapbook");
    const crowded = { ...base, decor: { ...base.decor, tapes: 0, doodles: 3 } };
    const counts = Array.from({ length: 60 }, (_, i) => {
      const { doc } = run(photos(1), plan(), { theme: crowded, seed: i + 1 });
      return doc.elements.filter((e) => e.type === "sticker" && parseSticker(e.assetPath) !== "label").length;
    });
    assert.ok(Math.min(...counts) >= 1 && Math.max(...counts) <= 3);
    assert.ok(counts.some((c) => c < 3), "with one photo, some of the three doodles find no clear spot and are dropped");
  });
});

describe("random layouts (fuzz)", () => {
  it("1,200 random photo sets, plans, themes, formats and slide counts all hold", () => {
    const rand = seeded(2024);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    const pick = <T,>(xs: readonly T[]) => xs[int(0, xs.length - 1)];
    const hexColour = () => "#" + int(0, 0xffffff).toString(16).padStart(6, "0");
    const words = ["sun", "café", "🎉", "a very long caption that goes on and on", "日本語のキャプション", "x", "WWWWWWWWWWWWWWWWWWWW", "line\nbreak", "  spaced   out  "];

    for (let i = 0; i < 1200; i++) {
      const n = int(1, 30);
      const ps: LayoutPhoto[] = Array.from({ length: n }, (_, k) => {
        const aspect = Math.exp((rand() * 2 - 1) * Math.log(5)); // 0.2 to 5
        return { id: `p${k}`, width: Math.round(2000 * Math.sqrt(aspect)), height: Math.round(2000 / Math.sqrt(aspect)), tags: rand() < 0.6 ? tags({ focus: { x: rand(), y: rand() }, hero: rand() < 0.1 }) : undefined };
      });
      const captions = Array.from({ length: int(0, 6) }, () => cleanText(pick(words)) || "x").map((c) => c.slice(0, 40));
      const p = ComposePlanSchema.parse({ theme: pick(THEME_IDS), background: hexColour(), pattern: pick(["grid", "dots", "lines", "none"]), ink: hexColour(), font: pick(CAPTION_FONTS), title: rand() < 0.5 ? cleanText(pick(words)).slice(0, 40) || undefined : undefined, captions });
      let theme: ThemeChoice = rand() < 0.5 ? p.theme : pick(THEME_IDS);
      if (rand() < 0.5) {
        const b = resolveTheme(theme);
        const patch: Partial<Customisation> = {};
        if (rand() < 0.5) patch.tilt = Math.round(rand() * 120) / 10;
        if (rand() < 0.5) patch.decorations = pick(DECORATIONS);
        if (rand() < 0.5) patch.edges = pick(EDGES);
        if (rand() < 0.5) patch.border = rand() < 0.5;
        if (rand() < 0.5) patch.caption = pick(CAPTIONS);
        if (rand() < 0.5) (patch.background = hexColour()), (patch.pattern = pick(["grid", "dots", "lines", "none"] as const));
        theme = customise(b, patch, ownLook(b));
      }
      const format = pick(FORMAT_KEYS);
      const slides = rand() < 0.3 ? int(Math.ceil(n / 5), 14) : undefined;
      const o: LayoutOptions = { format, maxSlides: pick([10, 20]), slides, seed: int(0, 1_000_000), theme, newId: counter() };
      checkLayout(ps, p, o, `case ${i} (${n} photos, ${format}, slides ${slides ?? "auto"})`);
    }
  });
});

describe("saved layout details", () => {
  it("keeps the plan, the model's notes on each photo, and the order, so it can be restyled without the model", () => {
    const ps = [photo(0, { tags: tags({ subject: "coffee" }) }), photo(1), photo(2, { tags: tags({ subject: "dog" }) })];
    const { doc } = run(ps, plan({ title: "hi" }), { seed: 42 });
    assert.deepEqual(doc.compose?.order, ["p0", "p1", "p2"]);
    assert.deepEqual(Object.keys(doc.compose!.tags).sort(), ["p0", "p2"]);
    assert.equal(doc.compose?.plan.title, "hi");
    assert.equal(doc.compose?.seed, 42);
  });
});

describe("plan and request limits", () => {
  const ok = { theme: "scrapbook", background: "#f4f1ea", pattern: "grid", ink: "#2b2b2b", font: "caveat", captions: ["me and coffee"] };
  it("accepts a normal plan", () => assert.ok(ComposePlanSchema.safeParse(ok).success));
  it("refuses colours that aren't hex, fonts or themes that aren't on the list, too many or too long captions", () => {
    for (const bad of [{ background: "red" }, { ink: "#fff" }, { font: "comic-sans" }, { theme: "neon" }, { pattern: "stripes" }, { captions: Array(7).fill("x") }, { captions: ["x".repeat(41)] }, { captions: [""] }, { title: "x".repeat(41) }]) {
      assert.ok(!ComposePlanSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad));
    }
  });
  it("flattens line breaks and control characters in text", () => {
    assert.equal(cleanText("a\nb\u0000c\u2028d   e"), "a b c d e");
    assert.equal(ComposePlanSchema.parse({ ...ok, captions: ["line one\nline two\u0007"] }).captions[0], "line one line two");
  });
  it("ink: keeps a readable preference, replaces an unreadable one", () => {
    assert.equal(inkFor("#ffffff", "#222222"), "#222222");
    assert.equal(inkFor("#ffffff", "#ffffff"), "#111111");
    assert.equal(inkFor("#101010", "#202020"), "#ffffff");
    assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  it("the compose request takes 1 to 30 photo ids, an optional theme, and nothing odd", () => {
    assert.ok(composeInput.safeParse({ mediaIds: [id(1)] }).success);
    assert.ok(composeInput.safeParse({ mediaIds: Array.from({ length: 30 }, (_, i) => id(i)), format: "square", title: "Trip", seed: 4, theme: "film" }).success);
    assert.ok(composeInput.safeParse({ mediaIds: [id(1)], theme: customise(resolveTheme("clean"), { tilt: 2 }, ownLook(resolveTheme("clean"))) }).success);
    for (const bad of [{ mediaIds: [] }, { mediaIds: Array.from({ length: 31 }, (_, i) => id(i)) }, { mediaIds: ["nope"] }, { mediaIds: [id(1)], format: "a4" }, { mediaIds: [id(1)], seed: -1 }, { mediaIds: [id(1)], seed: 1.5 }, { mediaIds: [id(1)], theme: "neon" }, { mediaIds: [id(1)], theme: { name: "x" } }, {}]) {
      assert.ok(!composeInput.safeParse(bad).success, JSON.stringify(bad));
    }
  });
});
