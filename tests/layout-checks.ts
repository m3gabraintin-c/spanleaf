import assert from "node:assert/strict";
import { contrast, mix } from "@/lib/colour";
import { bandShare, layoutCarousel, resolveLook, slidesFor, type LayoutOptions, type LayoutPhoto } from "@/lib/compose";
import type { Element } from "@/lib/doc";
import { FORMATS } from "@/lib/formats";
import type { ComposePlan } from "@/lib/plan";
import { DOODLE_IDS, parseSticker, STICKERS, TAPE_IDS } from "@/lib/stickers";
import { resolveTheme } from "@/lib/themes";

/** Not a test file. Everything a finished layout must satisfy, whatever the theme, photos or plan. */

const EPS = 1;

export interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** The box around an element once it is turned about its top-left corner. */
export function boxOf(e: Element): Box {
  const a = (e.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const xs = [0, e.w * c, -e.h * s, e.w * c - e.h * s];
  const ys = [0, e.w * s, e.h * c, e.w * s + e.h * c];
  return { l: e.x + Math.min(...xs), r: e.x + Math.max(...xs), t: e.y + Math.min(...ys), b: e.y + Math.max(...ys) };
}
export const centreOf = (e: Element): [number, number] => {
  const b = boxOf(e);
  return [(b.l + b.r) / 2, (b.t + b.b) / 2];
};
export const hits = (a: Box, b: Box, gap = 0.5) => a.l < b.r - gap && b.l < a.r - gap && a.t < b.b - gap && b.t < a.b - gap;

export function checkLayout(photos: LayoutPhoto[], plan: ComposePlan, opts: LayoutOptions, label: string) {
  const out = layoutCarousel(photos, plan, opts);
  const { doc, slideCount } = out;
  const f = FORMATS[opts.format];
  const W: number = f.width;
  const H: number = f.height;
  const totalW = W * slideCount;
  const theme = resolveTheme(opts.theme ?? plan.theme);
  const look = resolveLook(theme, plan);
  const here = (msg: string) => `${label}: ${msg}`;
  const slideOf = (e: Element) => Math.min(slideCount - 1, Math.max(0, Math.floor(centreOf(e)[0] / W)));

  // slides
  if (opts.slides !== undefined) assert.equal(slideCount, opts.slides, here("slide count"));
  else assert.equal(slideCount, slidesFor(photos.length, theme.perSlide, opts.maxSlides), here("slide count"));
  assert.ok(slideCount >= Math.ceil(photos.length / 5), here("at most five photos a slide"));

  // every photo once
  const images = doc.elements.filter((e) => e.type === "image");
  assert.deepEqual(images.map((e) => e.mediaId).sort(), photos.map((p) => p.id).sort(), here("every photo exactly once"));

  // inside the artboard, turned or not
  for (const e of doc.elements) {
    const b = boxOf(e);
    assert.ok(b.l >= -EPS && b.r <= totalW + EPS && b.t >= -EPS && b.b <= H + EPS, here(`${e.type} ${e.id} outside the artboard: ${JSON.stringify(b)}`));
  }

  // photos: shape, size, cut and tilt
  for (const e of images) {
    const src = photos.find((p) => p.id === e.mediaId)!;
    const shown = (e.crop!.w * src.width) / (e.crop!.h * src.height);
    assert.ok(Math.abs(shown / (e.w / e.h) - 1) < 0.01, here(`${e.mediaId} is squashed`));
    assert.ok(e.w >= 200 && e.h >= 200, here(`${e.mediaId} is only ${e.w} by ${e.h}`));
    assert.ok(Math.abs(e.rotation) <= theme.tilt + 0.05, here(`${e.mediaId} tilt ${e.rotation} over ${theme.tilt}`));
    const cut = theme.masks.find((m) => m.shape === e.mask?.shape && (m.radius === undefined || m.radius === e.mask?.radius));
    assert.ok(cut, here(`${e.mediaId} has a cut the theme doesn't allow: ${JSON.stringify(e.mask)}`));
    if (e.mask?.shape === "torn") assert.equal(typeof e.mask.seed, "number", here("torn edge has a seed"));
    assert.deepEqual(e.outline, theme.outline ?? undefined, here("outline"));
    assert.deepEqual(e.shadow, theme.shadow ?? undefined, here("shadow"));
  }

  // grids never overlap, unless the person asked for a tilt
  if (theme.layout !== "loose" && theme.tilt === 0) {
    for (const a of images) for (const b of images) {
      if (a !== b) assert.ok(!hits(boxOf(a), boxOf(b)), here(`${a.mediaId} and ${b.mediaId} overlap in a ${theme.layout} layout`));
    }
  }

  // captions
  const texts = doc.elements.filter((e) => e.type === "text");
  const filled = new Set(images.map(slideOf)).size;
  const wanted = Math.min([plan.title, ...plan.captions].filter(Boolean).length, filled);
  assert.equal(texts.length, wanted, here("number of captions"));
  assert.equal(new Set(texts.map(slideOf)).size, texts.length, here("one caption a slide"));
  const labels = doc.elements.filter((e) => parseSticker(e.assetPath) === "label");
  assert.equal(labels.length, theme.caption === "label" ? texts.length : 0, here("labels match captions"));
  for (const t of texts) {
    const back = theme.caption === "label" ? theme.labelTint : look.background;
    assert.ok(contrast(back, t.text!.color) >= 3, here(`caption ${t.text!.color} unreadable on ${back}`));
    assert.ok(Math.abs(t.rotation) <= theme.captionTilt + 0.05, here("caption tilt"));
    assert.equal(t.text!.font, look.font, here("caption font"));
    assert.ok(images.some((i) => slideOf(i) === slideOf(t)), here("a caption on an empty slide"));
    for (const i of images) assert.ok(!hits(boxOf(t), boxOf(i)), here(`caption "${t.text!.value}" ${JSON.stringify(boxOf(t))} runs into photo ${i.mediaId} ${JSON.stringify(boxOf(i))}`));
  }
  for (const l of labels) {
    assert.equal(l.tint, theme.labelTint, here("label colour"));
    const t = texts.find((x) => slideOf(x) === slideOf(l))!;
    const [lx, ly] = centreOf(l);
    const [tx, ty] = centreOf(t);
    assert.ok(Math.hypot(lx - tx, ly - ty) < 12, here(`caption is on its label: label ${JSON.stringify([lx, ly])} text ${JSON.stringify([tx, ty])}`));
  }

  // tape and doodles
  const stickers = doc.elements.filter((e) => e.type === "sticker");
  const tapes = stickers.filter((e) => TAPE_IDS.includes(parseSticker(e.assetPath) ?? ""));
  const doodles = stickers.filter((e) => DOODLE_IDS.includes(parseSticker(e.assetPath) ?? ""));
  assert.equal(tapes.length + doodles.length + labels.length, stickers.length, here("every sticker is tape, a doodle or a label"));
  // A photo that crosses a slide edge carries its tape and doodles with it, so counts are for the whole strip.
  const filledSlides = new Set(images.map(slideOf)).size;
  assert.ok(tapes.length <= theme.decor.tapes * filledSlides, here(`${tapes.length} tapes`));
  assert.ok(doodles.length <= theme.decor.doodles * filledSlides, here(`${doodles.length} doodles`));
  if (theme.decor.tapes > 0) assert.ok(tapes.length >= filledSlides, here(`${tapes.length} tapes for ${filledSlides} slides`));
  for (const e of [...tapes, ...doodles]) {
    const id = parseSticker(e.assetPath)!;
    assert.ok((TAPE_IDS.includes(id) ? theme.decor.tapeIds : theme.decor.doodleIds).includes(id), here(`${id} isn't in the theme`));
    assert.ok((TAPE_IDS.includes(id) ? theme.decor.tapeTints : theme.decor.doodleTints).includes(e.tint!), here(`${e.tint} isn't a theme tint`));
    assert.ok(Math.abs(e.w / e.h / STICKERS[id].aspect - 1) < 0.05, here(`${id} lost its shape`));
  }
  const decorated = [...tapes, ...doodles];
  for (const a of decorated) for (const b of decorated) {
    if (a === b) continue;
    const [ax, ay] = centreOf(a);
    const [bx, by] = centreOf(b);
    assert.ok(Math.hypot(ax - bx, ay - by) > 50, here("two decorations are piled together"));
  }
  const captioned = new Set(texts.map(slideOf));
  for (const d of doodles) {
    if (captioned.has(slideOf(d))) assert.ok(boxOf(d).b <= H * (1 - bandShare(theme)) + EPS, here("a doodle sits over the caption"));
  }

  // what was saved for restyling
  assert.deepEqual(doc.compose?.order, photos.map((p) => p.id), here("saved order"));
  assert.equal(doc.compose?.seed, opts.seed ?? 1, here("saved seed"));
  assert.deepEqual(doc.compose?.theme, opts.theme ?? plan.theme, here("saved theme"));
  assert.equal(doc.background.value, look.background, here("background"));
  if (look.pattern === "none") assert.equal(doc.pattern, undefined, here("no pattern"));
  else {
    assert.equal(doc.pattern?.kind, look.pattern, here("pattern kind"));
    assert.equal(doc.pattern?.color, mix(look.background, look.ink, 0.12), here("pattern colour"));
    assert.ok(contrast(look.background, doc.pattern!.color) < 1.7, here("pattern should stay quiet"));
  }
  assert.ok(doc.elements.length <= 500, here("too many elements"));
  return out;
}
