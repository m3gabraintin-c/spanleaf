import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrast } from "@/lib/colour";
import { resolveLook } from "@/lib/compose";
import { FONTS } from "@/lib/fonts.generated";
import { FALLBACK_PLAN } from "@/lib/plan";
import { DOODLE_IDS, STICKERS, TAPE_IDS } from "@/lib/stickers";
import {
  CAPTIONS, customise, DECORATIONS, describeThemes, EDGES, readCustomisation, resolveTheme, ThemeChoiceSchema, ThemeSchema, THEME_IDS, THEMES,
  type Customisation, type Look, type Theme, type ThemeId,
} from "@/lib/themes";

const PATTERNS = ["grid", "dots", "lines", "none"] as const;
const lookOf = (t: Theme) => resolveLook(t, FALLBACK_PLAN);
/** The colours a theme is designed with, before any model's picks. */
const ownLook = (t: Theme): Look => ({ background: t.palette.background, ink: t.palette.ink });
const clone = (t: Theme = THEMES.scrapbook) => structuredClone(t) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("built-in themes", () => {
  it("there are six, and the id list is the registry", () => {
    assert.deepEqual([...THEME_IDS].sort(), ["clean", "dreamy", "editorial", "film", "polaroid", "scrapbook"]);
    assert.deepEqual(THEME_IDS, Object.keys(THEMES));
  });
  it("each one passes the schema unchanged", () => {
    for (const id of THEME_IDS) assert.deepEqual(ThemeSchema.parse(THEMES[id]), THEMES[id], id);
  });
  it("names are unique and descriptions are short enough for the model's instructions", () => {
    const names = THEME_IDS.map((id) => THEMES[id].name);
    assert.equal(new Set(names).size, names.length);
    for (const id of THEME_IDS) assert.ok(THEMES[id].description.length > 20 && THEMES[id].description.length <= 140, id);
  });
  it("their own colours are readable: caption ink on the background, and on the label where there is one", () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      assert.ok(contrast(t.palette.background, t.palette.ink) >= 4.5, `${id} ink on background`);
      if (t.caption === "label") assert.ok(contrast(t.labelTint, t.palette.ink) >= 4.5, `${id} ink on label`);
    }
  });
  it("every font is a real one, and every sticker they name exists with the right kind", () => {
    const fonts = new Set(FONTS.map((f) => f.id));
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      assert.ok(fonts.has(t.font), `${id} font`);
      for (const s of t.decor.tapeIds) assert.equal(STICKERS[s].kind, "tape", `${id} ${s}`);
      for (const s of t.decor.doodleIds) assert.equal(STICKERS[s].kind, "doodle", `${id} ${s}`);
    }
    assert.ok(TAPE_IDS.length >= 2 && DOODLE_IDS.length >= 5);
  });
  it("the three that follow the photos' colours say so, and the three that keep their own say so", () => {
    const adapt = Object.fromEntries(THEME_IDS.map((id) => [id, THEMES[id].palette.adapt]));
    assert.deepEqual(adapt, { scrapbook: true, polaroid: false, dreamy: false, editorial: true, clean: true, film: false });
  });
  it("describeThemes names every theme once with its description", () => {
    const text = describeThemes();
    for (const id of THEME_IDS) {
      assert.equal(text.split(`- "${id}":`).length, 2, id);
      assert.ok(text.includes(THEMES[id].description), id);
    }
  });
  it("a choice is an id or a whole theme, and resolves to the theme", () => {
    for (const id of THEME_IDS) {
      assert.ok(ThemeChoiceSchema.safeParse(id).success);
      assert.equal(resolveTheme(id), THEMES[id]);
    }
    const custom = customise(THEMES.clean, { tilt: 5 }, lookOf(THEMES.clean));
    assert.ok(ThemeChoiceSchema.safeParse(custom).success);
    assert.equal(resolveTheme(custom), custom);
    for (const bad of ["neon", "", "SCRAPBOOK", 3, null, {}, { ...custom, layout: "x" }]) assert.ok(!ThemeChoiceSchema.safeParse(bad).success, JSON.stringify(bad));
  });
});

describe("theme limits", () => {
  const mutate = (f: (t: Record<string, any>) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = clone();
    f(t);
    return t;
  };
  const ok = (name: string, f: (t: Record<string, any>) => void) => assert.ok(ThemeSchema.safeParse(mutate(f)).success, `should accept ${name}`); // eslint-disable-line @typescript-eslint/no-explicit-any
  const bad = (name: string, f: (t: Record<string, any>) => void) => assert.ok(!ThemeSchema.safeParse(mutate(f)).success, `should refuse ${name}`); // eslint-disable-line @typescript-eslint/no-explicit-any

  it("accepts every value at the edge of its range", () => {
    ok("tilt 0", (t) => (t.tilt = 0));
    ok("tilt 12", (t) => (t.tilt = 12));
    ok("perSlide 1", (t) => (t.perSlide = 1));
    ok("perSlide 5", (t) => (t.perSlide = 5));
    ok("captionTilt 0", (t) => (t.captionTilt = 0));
    ok("captionTilt 6", (t) => (t.captionTilt = 6));
    ok("bridge 0", (t) => (t.bridge = 0));
    ok("bridge 0.2", (t) => (t.bridge = 0.2));
    ok("no tapes or doodles", (t) => ((t.decor.tapes = 0), (t.decor.doodles = 0)));
    ok("2 tapes 3 doodles", (t) => ((t.decor.tapes = 2), (t.decor.doodles = 3)));
    ok("one mask", (t) => (t.masks = [{ shape: "rect" }]));
    ok("four masks", (t) => (t.masks = [{ shape: "rect" }, { shape: "torn" }, { shape: "ellipse" }, { shape: "rounded", radius: 0 }]));
    ok("radius 0.5", (t) => (t.masks = [{ shape: "rounded", radius: 0.5 }]));
    ok("no outline", (t) => (t.outline = null));
    ok("outline 80 wide", (t) => (t.outline = { color: "#000000", width: 80 }));
    ok("no shadow", (t) => (t.shadow = null));
    for (const p of PATTERNS) ok(`pattern ${p}`, (t) => (t.palette.pattern = p));
    for (const l of ["loose", "tidy", "tight"]) ok(`layout ${l}`, (t) => (t.layout = l));
    for (const a of ["left", "center", "right"]) ok(`align ${a}`, (t) => (t.align = a));
    for (const c of CAPTIONS) ok(`caption ${c}`, (t) => (t.caption = c));
    ok("a 40 character name", (t) => (t.name = "x".repeat(40)));
    ok("six tints", (t) => (t.decor.tapeTints = Array(6).fill("#ffffff")));
  });

  it("refuses anything outside its range", () => {
    bad("tilt -1", (t) => (t.tilt = -1));
    bad("tilt 12.1", (t) => (t.tilt = 12.1));
    bad("tilt NaN", (t) => (t.tilt = NaN));
    bad("tilt as text", (t) => (t.tilt = "4"));
    bad("perSlide 0", (t) => (t.perSlide = 0));
    bad("perSlide 6", (t) => (t.perSlide = 6));
    bad("perSlide 2.5", (t) => (t.perSlide = 2.5));
    bad("captionTilt 7", (t) => (t.captionTilt = 7));
    bad("bridge 0.21", (t) => (t.bridge = 0.21));
    bad("bridge -0.01", (t) => (t.bridge = -0.01));
    bad("3 tapes", (t) => (t.decor.tapes = 3));
    bad("negative tapes", (t) => (t.decor.tapes = -1));
    bad("1.5 tapes", (t) => (t.decor.tapes = 1.5));
    bad("4 doodles", (t) => (t.decor.doodles = 4));
    bad("no masks", (t) => (t.masks = []));
    bad("five masks", (t) => (t.masks = Array(5).fill({ shape: "rect" })));
    bad("unknown mask", (t) => (t.masks = [{ shape: "star" }]));
    bad("radius 0.51", (t) => (t.masks = [{ shape: "rounded", radius: 0.51 }]));
    bad("outline 81 wide", (t) => (t.outline = { color: "#000000", width: 81 }));
    bad("outline colour name", (t) => (t.outline = { color: "red", width: 4 }));
    bad("shadow opacity 2", (t) => (t.shadow = { color: "#000000", blur: 4, x: 0, y: 0, opacity: 2 }));
    bad("pattern stripes", (t) => (t.palette.pattern = "stripes"));
    bad("short colour", (t) => (t.palette.background = "#fff"));
    bad("adapt as text", (t) => (t.palette.adapt = "yes"));
    bad("unknown font", (t) => (t.font = "comic-sans"));
    bad("empty font", (t) => (t.font = ""));
    bad("unknown layout", (t) => (t.layout = "grid"));
    bad("unknown caption style", (t) => (t.caption = "overlay"));
    bad("unknown alignment", (t) => (t.align = "justify"));
    bad("empty name", (t) => (t.name = ""));
    bad("blank name", (t) => (t.name = " \n\t "));
    bad("41 character name", (t) => (t.name = "x".repeat(41)));
    bad("141 character description", (t) => (t.description = "x".repeat(141)));
    bad("no tape ids", (t) => (t.decor.tapeIds = []));
    bad("a doodle as tape", (t) => (t.decor.tapeIds = ["star"]));
    bad("tape as a doodle", (t) => (t.decor.doodleIds = ["tape"]));
    bad("the label as a doodle", (t) => (t.decor.doodleIds = ["label"]));
    bad("no tints", (t) => (t.decor.doodleTints = []));
    bad("seven tints", (t) => (t.decor.tapeTints = Array(7).fill("#ffffff")));
    bad("label colour name", (t) => (t.labelTint = "cream"));
  });

  it("refuses a theme with any part missing", () => {
    for (const key of Object.keys(THEMES.scrapbook)) assert.ok(!ThemeSchema.safeParse(mutate((t) => delete t[key])).success, key);
    for (const key of Object.keys(THEMES.scrapbook.decor)) assert.ok(!ThemeSchema.safeParse(mutate((t) => delete t.decor[key])).success, `decor.${key}`);
    for (const key of Object.keys(THEMES.scrapbook.palette)) assert.ok(!ThemeSchema.safeParse(mutate((t) => delete t.palette[key])).success, `palette.${key}`);
  });

  it("drops unknown fields and flattens line breaks in text", () => {
    const parsed = ThemeSchema.parse(mutate((t) => ((t.url = "https://evil.test"), (t.decor.script = "x"), (t.name = "My\nlook\u0007")))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.ok(!("url" in parsed) && !("script" in parsed.decor));
    assert.equal(parsed.name, "My look");
  });
});

describe("customising a theme", () => {
  const bases = THEME_IDS.map((id) => [id, THEMES[id]] as const);

  it("reads what each built-in looks like in plain terms", () => {
    const read = (id: ThemeId) => readCustomisation(THEMES[id], ownLook(THEMES[id]));
    assert.deepEqual(read("scrapbook"), { background: "#f4f1ea", pattern: "grid", tilt: 4, decorations: "lots", edges: "mixed", border: true, caption: "label" });
    assert.deepEqual(read("polaroid"), { background: "#e8dcc8", pattern: "none", tilt: 6, decorations: "some", edges: "square", border: true, caption: "band" });
    assert.deepEqual(read("dreamy"), { background: "#fbeef3", pattern: "dots", tilt: 3, decorations: "some", edges: "mixed", border: true, caption: "label" });
    assert.deepEqual(read("editorial"), { background: "#faf8f4", pattern: "none", tilt: 0, decorations: "none", edges: "square", border: false, caption: "band" });
    assert.deepEqual(read("clean"), { background: "#ffffff", pattern: "none", tilt: 0, decorations: "none", edges: "rounded", border: false, caption: "band" });
    assert.deepEqual(read("film"), { background: "#141414", pattern: "none", tilt: 0, decorations: "none", edges: "square", border: true, caption: "band" });
  });

  it("every control, on every built-in, makes a valid theme that reads back as asked and changes nothing else", () => {
    const patches: Partial<Customisation>[] = [
      ...["#000000", "#ffffff", "#336699"].map((background) => ({ background })),
      ...PATTERNS.map((pattern) => ({ pattern })),
      ...[0, 0.1, 6, 12].map((tilt) => ({ tilt })),
      ...DECORATIONS.map((decorations) => ({ decorations })),
      ...EDGES.map((edges) => ({ edges })),
      ...[true, false].map((border) => ({ border })),
      ...CAPTIONS.map((caption) => ({ caption })),
    ];
    for (const [id, base] of bases) {
      const look = lookOf(base);
      const before = readCustomisation(base, look);
      for (const patch of patches) {
        const next = customise(base, patch, look);
        assert.ok(ThemeSchema.safeParse(next).success, `${id} ${JSON.stringify(patch)}`);
        const after = readCustomisation(next, lookOf(next));
        assert.deepEqual(after, { ...before, ...patch }, `${id} ${JSON.stringify(patch)}`);
        // Anything not named in the patch is as it was (the name aside, and palette and font when colours move).
        const { name: _n, ...was } = base;
        const { name: _m, ...now } = next;
        const palette = { ...was.palette, ...("background" in patch ? { background: patch.background, ink: look.ink, adapt: false } : {}), ...("pattern" in patch ? { pattern: patch.pattern } : {}) };
        assert.deepEqual(now.palette, palette, `${id} palette`);
        assert.equal(now.font, was.font, `${id} font never changes`);
        for (const k of ["layout", "perSlide", "bridge", "captionTilt", "align", "labelTint", "description", "shadow"] as const) assert.deepEqual(now[k], was[k], `${id} ${k}`);
        if (!("tilt" in patch)) assert.equal(now.tilt, was.tilt);
        if (!("caption" in patch)) assert.equal(now.caption, was.caption);
        if (!("edges" in patch)) assert.deepEqual(now.masks, was.masks);
        if (!("decorations" in patch)) assert.deepEqual(now.decor, was.decor);
        if (!("border" in patch)) assert.deepEqual(now.outline, was.outline);
      }
    }
  });

  it("every combination of controls at once is valid and reads back exactly (5,760 themes)", () => {
    let count = 0;
    for (const [id, base] of bases) {
      const look = lookOf(base);
      for (const decorations of DECORATIONS) for (const edges of EDGES) for (const border of [true, false]) for (const caption of CAPTIONS)
        for (const tilt of [0, 12]) for (const background of ["#101010", "#fafafa"]) for (const pattern of PATTERNS) {
          const patch = { decorations, edges, border, caption, tilt, background, pattern };
          const next = customise(base, patch, look);
          assert.deepEqual(readCustomisation(next, lookOf(next)), patch, id);
          count++;
        }
    }
    assert.equal(count, 6 * 3 * 5 * 2 * 2 * 2 * 2 * 4);
  });

  it("changing the background pins both colours to what is showing, so a later restyle can't swap them", () => {
    const plan = { ...FALLBACK_PLAN, background: "#abcdef", ink: "#102030" };
    const look = resolveLook(THEMES.scrapbook, plan);
    assert.deepEqual(look, { background: "#abcdef", ink: "#102030" });
    const next = customise(THEMES.scrapbook, { background: "#ffeedd" }, look);
    assert.deepEqual(next.palette, { background: "#ffeedd", ink: "#102030", pattern: "grid", adapt: false });
    assert.deepEqual(resolveLook(next, { ...plan, background: "#000000", ink: "#ffffff" }), { background: "#ffeedd", ink: "#102030" });
  });

  it("changing the pattern changes only the pattern, and the font is never touched", () => {
    const next = customise(THEMES.scrapbook, { pattern: "dots" }, lookOf(THEMES.scrapbook));
    assert.deepEqual(next.palette, { ...THEMES.scrapbook.palette, pattern: "dots" });
    assert.equal(next.font, THEMES.scrapbook.font);
  });

  it("changing something that isn't a colour leaves a theme that follows the photos following them", () => {
    assert.equal(customise(THEMES.scrapbook, { tilt: 9 }, lookOf(THEMES.scrapbook)).palette.adapt, true);
  });

  it("the border toggle keeps a thick built-in frame when asked to stay on, and adds a white one when there was none", () => {
    assert.deepEqual(customise(THEMES.polaroid, { border: true }, lookOf(THEMES.polaroid)).outline, { color: "#ffffff", width: 22 });
    assert.deepEqual(customise(THEMES.clean, { border: true }, lookOf(THEMES.clean)).outline, { color: "#ffffff", width: 10 });
    assert.equal(customise(THEMES.polaroid, { border: false }, lookOf(THEMES.polaroid)).outline, null);
  });

  it("names the result after its base, once, and never past 40 characters", () => {
    const once = customise(THEMES.film, { tilt: 1 }, lookOf(THEMES.film));
    assert.equal(once.name, "Film (custom)");
    assert.equal(customise(once, { tilt: 2 }, lookOf(once)).name, "Film (custom)");
    const long = { ...THEMES.film, name: "x".repeat(40) };
    const named = customise(long, { tilt: 1 }, lookOf(long));
    assert.ok(named.name.length <= 40 && named.name.endsWith(" (custom)"));
  });

  it("doesn't change the theme it was given", () => {
    const frozen = structuredClone(THEMES.scrapbook);
    customise(THEMES.scrapbook, { tilt: 0, edges: "oval", decorations: "none", border: false, caption: "band", background: "#000000", pattern: "none" }, lookOf(THEMES.scrapbook));
    assert.deepEqual(THEMES.scrapbook, frozen);
  });

  it("refuses a control value the schema wouldn't allow instead of making a broken theme", () => {
    const look: Look = lookOf(THEMES.scrapbook);
    assert.throws(() => customise(THEMES.scrapbook, { tilt: 13 }, look));
    assert.throws(() => customise(THEMES.scrapbook, { tilt: -1 }, look));
    assert.throws(() => customise(THEMES.scrapbook, { tilt: NaN }, look));
    assert.throws(() => customise(THEMES.scrapbook, { background: "red" }, look));
  });
});
