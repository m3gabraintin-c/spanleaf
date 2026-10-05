import { inkFor } from "./colour";
import { DocSchema, uid, type Doc, type Element } from "./doc";
import { FORMATS, type FormatKey } from "./formats";
import { coverCrop, seeded } from "./geometry";
import { makePattern } from "./pattern";
import type { ComposePlan, PhotoTags } from "./plan";
import { STICKERS, stickerAsset } from "./stickers";
import { resolveTheme, type Look, type Theme, type ThemeChoice } from "./themes";

/**
 * Turns a set of photos into a carousel document in a theme. The model only makes taste decisions (see
 * plan.ts). Every position, size, rotation and crop comes from the arithmetic here, so the result is always
 * inside the artboard and always passes DocSchema.
 */

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cells for 0 to 5 photos on a slide, as fractions of the slide. The list order is the stacking order. */
const TEMPLATES: Record<Theme["layout"], Cell[][]> = {
  // Overlapping, for the collage look.
  loose: [
    [],
    [{ x: 0.07, y: 0.09, w: 0.86, h: 0.72 }],
    [{ x: 0.06, y: 0.07, w: 0.62, h: 0.5 }, { x: 0.34, y: 0.45, w: 0.6, h: 0.46 }],
    [{ x: 0.05, y: 0.06, w: 0.62, h: 0.44 }, { x: 0.38, y: 0.36, w: 0.56, h: 0.4 }, { x: 0.06, y: 0.62, w: 0.4, h: 0.3 }],
    [{ x: 0.04, y: 0.05, w: 0.54, h: 0.38 }, { x: 0.5, y: 0.14, w: 0.44, h: 0.32 }, { x: 0.07, y: 0.46, w: 0.4, h: 0.34 }, { x: 0.44, y: 0.58, w: 0.5, h: 0.36 }],
    [{ x: 0.04, y: 0.04, w: 0.46, h: 0.3 }, { x: 0.52, y: 0.08, w: 0.44, h: 0.34 }, { x: 0.05, y: 0.38, w: 0.42, h: 0.28 }, { x: 0.46, y: 0.44, w: 0.48, h: 0.28 }, { x: 0.2, y: 0.7, w: 0.58, h: 0.26 }],
  ],
  // Gutters and no overlap.
  tidy: [
    [],
    [{ x: 0.08, y: 0.1, w: 0.84, h: 0.7 }],
    [{ x: 0.06, y: 0.06, w: 0.88, h: 0.42 }, { x: 0.06, y: 0.52, w: 0.88, h: 0.42 }],
    [{ x: 0.06, y: 0.06, w: 0.88, h: 0.44 }, { x: 0.06, y: 0.54, w: 0.42, h: 0.4 }, { x: 0.52, y: 0.54, w: 0.42, h: 0.4 }],
    [{ x: 0.06, y: 0.06, w: 0.42, h: 0.42 }, { x: 0.52, y: 0.06, w: 0.42, h: 0.42 }, { x: 0.06, y: 0.52, w: 0.42, h: 0.42 }, { x: 0.52, y: 0.52, w: 0.42, h: 0.42 }],
    [{ x: 0.06, y: 0.05, w: 0.88, h: 0.3 }, { x: 0.06, y: 0.39, w: 0.28, h: 0.27 }, { x: 0.36, y: 0.39, w: 0.28, h: 0.27 }, { x: 0.66, y: 0.39, w: 0.28, h: 0.27 }, { x: 0.06, y: 0.7, w: 0.88, h: 0.25 }],
  ],
  // Thin gutters, photos nearly filling the slide.
  tight: [
    [],
    [{ x: 0.03, y: 0.04, w: 0.94, h: 0.8 }],
    [{ x: 0.03, y: 0.03, w: 0.94, h: 0.43 }, { x: 0.03, y: 0.48, w: 0.94, h: 0.43 }],
    [{ x: 0.03, y: 0.03, w: 0.94, h: 0.5 }, { x: 0.03, y: 0.55, w: 0.46, h: 0.36 }, { x: 0.51, y: 0.55, w: 0.46, h: 0.36 }],
    [{ x: 0.03, y: 0.03, w: 0.46, h: 0.43 }, { x: 0.51, y: 0.03, w: 0.46, h: 0.43 }, { x: 0.03, y: 0.48, w: 0.46, h: 0.43 }, { x: 0.51, y: 0.48, w: 0.46, h: 0.43 }],
    [{ x: 0.03, y: 0.03, w: 0.94, h: 0.3 }, { x: 0.03, y: 0.35, w: 0.3, h: 0.27 }, { x: 0.35, y: 0.35, w: 0.3, h: 0.27 }, { x: 0.67, y: 0.35, w: 0.3, h: 0.27 }, { x: 0.03, y: 0.64, w: 0.94, h: 0.27 }],
  ],
};

const MAX_PER_SLIDE = 5;
/** The space kept between a photo that runs over a slide edge and the next slide's photos, in a grid. */
const GUTTER = 0.02;
const DOODLE_SHADOW = { color: "#000000", blur: 8, x: 0, y: 2, opacity: 0.45 };
const LABEL_SHADOW = { color: "#000000", blur: 10, x: 0, y: 3, opacity: 0.18 };

/** The share of a slide kept free at the bottom for a caption: a paper label needs more room than plain text. */
export const bandShare = (theme: Theme) => (theme.caption === "label" ? 0.17 : 0.11);

export interface LayoutPhoto {
  /** The media id the element will point at. */
  id: string;
  width: number;
  height: number;
  name?: string;
  tags?: PhotoTags;
}

export interface LayoutOptions {
  format: FormatKey;
  /** The most slides the person's plan allows. Ignored when slides is given. */
  maxSlides: number;
  /** Use exactly this many slides. Slides that get no photo stay empty. */
  slides?: number;
  /** Same seed, same carousel. A different seed shuffles tilt, torn edges and which photo goes where. */
  seed?: number;
  newId?: () => string;
  /** A built-in theme id or a custom theme. Without it, the theme the model picked for the photos. */
  theme?: ThemeChoice;
}

/** The colours and font a theme shows for these photos: the model's picks where the theme allows, its own otherwise. */
export function resolveLook(theme: Theme, plan: ComposePlan): Look {
  const p = theme.palette;
  return p.adapt ? { background: plan.background, ink: plan.ink, pattern: plan.pattern, font: plan.font } : { background: p.background, ink: p.ink, pattern: p.pattern, font: theme.font };
}

/** How many slides n photos get: the theme's share each, never more than five, never more than the plan allows. */
export function slidesFor(n: number, perSlide: number, maxSlides: number) {
  const fewest = Math.ceil(n / MAX_PER_SLIDE);
  if (fewest > maxSlides) throw new Error(`${n} photos don't fit in ${maxSlides} slides.`);
  return Math.min(maxSlides, Math.max(Math.ceil(n / perSlide), fewest));
}

/** Where the top-left corner goes so that a w by h box, turned by deg about that corner, ends up centred on (cx, cy). */
function placeCentred(cx: number, cy: number, w: number, h: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  return { x: cx - (w / 2) * Math.cos(r) + (h / 2) * Math.sin(r), y: cy - (w / 2) * Math.sin(r) - (h / 2) * Math.cos(r) };
}

/**
 * Shifts a box so that, once turned by deg about its top-left corner, it lies between minX and maxX and above
 * maxY (and below the top of the artboard). A tilted box reaches further than its own width and height, so the
 * corners are worked out.
 */
function fitBox(x: number, y: number, w: number, h: number, deg: number, minX: number, maxX: number, maxY: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const xs = [0, w * c, -h * s, w * c - h * s];
  const ys = [0, w * s, h * c, w * s + h * c];
  const left = x + Math.min(...xs);
  const right = x + Math.max(...xs);
  const top = y + Math.min(...ys);
  const bottom = y + Math.max(...ys);
  let dx = 0;
  let dy = 0;
  if (right > maxX) dx = maxX - right;
  if (left + dx < minX) dx = minX - left;
  if (bottom > maxY) dy = maxY - bottom;
  if (top + dy < 0) dy = -top;
  return { x: Math.round(x + dx), y: Math.round(y + dy) };
}

/** How much to shrink a w by h box so that, turned by deg, it fits in limitW by limitH. 1 when it already does. */
function fitScale(w: number, h: number, deg: number, limitW: number, limitH: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return Math.min(1, limitW / (w * c + h * s), limitH / (w * s + h * c));
}

const aspectGap = (photo: LayoutPhoto, cell: Cell, slideAspect: number) => Math.abs(Math.log(photo.width / photo.height / ((cell.w / cell.h) * slideAspect)));

/** Gives each cell, biggest first, the unused photo whose shape is closest. The hero photo goes in the biggest. */
function assign(group: LayoutPhoto[], cells: Cell[], slideAspect: number, heroId: string | undefined): LayoutPhoto[] {
  const order = cells.map((_, i) => i).sort((a, b) => cells[b].w * cells[b].h - cells[a].w * cells[a].h);
  const left = [...group];
  const out: LayoutPhoto[] = new Array(cells.length);
  order.forEach((ci, rank) => {
    let pick = rank === 0 && heroId !== undefined ? left.findIndex((p) => p.id === heroId) : -1;
    if (pick < 0) {
      let best = Infinity;
      left.forEach((p, i) => {
        const gap = aspectGap(p, cells[ci], slideAspect);
        if (gap < best) {
          best = gap;
          pick = i;
        }
      });
    }
    out[ci] = left.splice(pick, 1)[0];
  });
  return out;
}

export function layoutCarousel(photos: LayoutPhoto[], plan: ComposePlan, opts: LayoutOptions): { doc: Doc; slideCount: number } {
  if (photos.length === 0) throw new Error("Add at least one photo.");
  const W: number = FORMATS[opts.format].width;
  const H: number = FORMATS[opts.format].height;
  const choice = opts.theme ?? plan.theme;
  const theme = resolveTheme(choice);
  const look = resolveLook(theme, plan);
  const rand = seeded(opts.seed ?? 1);
  const newId = opts.newId ?? uid;

  let slideCount: number;
  if (opts.slides === undefined) slideCount = slidesFor(photos.length, theme.perSlide, opts.maxSlides);
  else if (Math.ceil(photos.length / MAX_PER_SLIDE) > opts.slides) throw new Error(`${photos.length} photos don't fit in ${opts.slides} slides.`);
  else slideCount = opts.slides;
  const totalW = W * slideCount;

  // Photos keep the order they were given. Slides get equal shares, the early ones one more if it doesn't divide.
  const base = Math.floor(photos.length / slideCount);
  const extra = photos.length % slideCount;
  const groups: LayoutPhoto[][] = [];
  let at = 0;
  for (let s = 0; s < slideCount; s++) {
    const size = base + (s < extra ? 1 : 0);
    groups.push(photos.slice(at, at + size));
    at += size;
  }

  // At most one line of text per slide that has photos, spread evenly. A title, if there is one, goes first.
  const filled = groups.flatMap((g, s) => (g.length ? [s] : []));
  const lines = [plan.title, ...plan.captions].filter((t): t is string => !!t).slice(0, filled.length);
  const textOn = new Map<number, { value: string; isTitle: boolean }>();
  lines.forEach((value, j) => textOn.set(filled[Math.floor((j * filled.length) / lines.length)], { value, isTitle: j === 0 && !!plan.title }));

  const margin = Math.min(...TEMPLATES[theme.layout].flat().map((c) => c.x));
  const reach = theme.layout === "loose" ? theme.bridge : Math.max(0, Math.min(theme.bridge, margin - GUTTER));
  const share = bandShare(theme);
  const heroId = photos.find((p) => p.tags?.hero)?.id; // only the first flagged photo counts
  const elements: Element[] = [];
  let maskTurn = Math.floor(rand() * theme.masks.length);

  // A sticker, kept inside the artboard and above maxY. x and y are the top-left corner before it turns.
  const sticker = (id: string, x: number, y: number, w: number, h: number, rotation: number, tint: string, extra: Partial<Element> = {}, maxY = H): Element => ({
    id: newId(),
    type: "sticker",
    ...fitBox(x, y, w, h, rotation, 0, totalW, maxY),
    w,
    h,
    rotation,
    locked: false,
    name: STICKERS[id].label,
    assetPath: stickerAsset(id),
    tint,
    ...extra,
  });
  const turn = (max: number) => (max ? Math.round((rand() * 2 - 1) * max * 10) / 10 : 0);
  const pickOf = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const shuffled = <T,>(list: readonly T[]) => list.map((v) => [rand(), v] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

  groups.forEach((group, s) => {
    if (group.length === 0) return;
    const line = textOn.get(s);
    const band = line ? share : 0;
    const cells = TEMPLATES[theme.layout][group.length].map((c) => ({ ...c, y: c.y * (1 - band), h: c.h * (1 - band) }));
    const placed = assign(group, cells, W / H, heroId);

    // The right-most photo on every slide but the last runs over the edge, so slides read as one strip. In
    // a grid it stops inside the next slide's margin, so it never lands on that slide's photos.
    let bridge = -1;
    if (reach > 0 && s < slideCount - 1 && group.length >= 2) {
      bridge = cells.reduce((best, c, i) => (c.x + c.w > cells[best].x + cells[best].w ? i : best), 0);
    }

    const firstOfSlide = elements.length;
    cells.forEach((cell, i) => {
      const photo = placed[i];
      const rotation = turn(theme.tilt);
      // A photo that runs over the edge must also stay clear of a caption on the slide it runs into.
      const lowest = band || (i === bridge && textOn.has(s + 1)) ? H * (1 - share) : H;
      // A turned photo reaches further than its own width and height. If it would no longer fit on its
      // slide, it is made a little smaller.
      const shrink = fitScale(cell.w * W, cell.h * H, rotation, W, lowest);
      const w = Math.round(cell.w * W * shrink);
      const h = Math.round(cell.h * H * shrink);
      const left = s * W + (i === bridge ? (1 + reach - cell.w) * W : cell.x * W);
      const cut = theme.masks[maskTurn++ % theme.masks.length];
      const el: Element = {
        id: newId(),
        type: "image",
        ...fitBox(left, cell.y * H, w, h, rotation, s * W, (s + 1) * W + (i === bridge ? reach * W : 0), lowest),
        w,
        h,
        rotation,
        locked: false,
        mediaId: photo.id,
        crop: coverCrop(photo.width, photo.height, w, h, photo.tags?.focus),
        mask: cut.shape === "torn" ? { shape: "torn", seed: Math.floor(rand() * 1_000_000) } : { ...cut },
      };
      if (photo.name) el.name = photo.name.slice(0, 200);
      if (theme.outline) el.outline = { ...theme.outline };
      if (theme.shadow) el.shadow = { ...theme.shadow };
      elements.push(el);
    });

    // Tape and doodles. Each tape goes on a different photo of the slide, across its top edge or over its
    // top-left corner. A doodle goes on a lower photo corner, and a doodle with nowhere clear to go is left
    // out rather than piled on another.
    const order = shuffled(elements.slice(firstOfSlide));
    const stuck: [number, number][] = [];
    const clear = (cx: number, cy: number) => stuck.every(([x, y]) => Math.hypot(x - cx, y - cy) > 90);

    for (let k = 0; k < Math.min(theme.decor.tapes, order.length); k++) {
      const ph = order[k];
      const id = pickOf(theme.decor.tapeIds);
      const w = Math.round(W * 0.17);
      const h = Math.round(w / STICKERS[id].aspect);
      const deg = k === 0 ? turn(12) : -40 + turn(8);
      const cx = k === 0 ? ph.x + ph.w * (0.3 + rand() * 0.4) : ph.x + 14;
      const cy = k === 0 ? ph.y + 4 : ph.y + 14;
      const pos = placeCentred(cx, cy, w, h, deg);
      elements.push(sticker(id, pos.x, pos.y, w, h, deg, pickOf(theme.decor.tapeTints)));
      stuck.push([cx, cy]);
    }

    // Doodles stay above the caption and on the slide of their own photos, even when a photo runs over the edge.
    const limit = (line ? H * (1 - share) : H) - 8;
    shuffled(theme.decor.doodleIds).slice(0, theme.decor.doodles).forEach((id, k) => {
      const size = Math.round(W * (0.11 + rand() * 0.05));
      const w = STICKERS[id].aspect >= 1 ? Math.round(size * Math.min(STICKERS[id].aspect, 1.6)) : Math.round(size * STICKERS[id].aspect);
      const h = Math.round(w / STICKERS[id].aspect);
      const deg = turn(20);
      const tint = pickOf(theme.decor.doodleTints);
      const startRight = k === 0 ? true : rand() < 0.5;
      spot: for (let a = 0; a < order.length; a++) {
        const ph = order[(k + theme.decor.tapes + a) % order.length];
        for (const right of [startRight, !startRight]) {
          const cx = Math.min(Math.max((right ? ph.x + ph.w : ph.x) + (right ? -1 : 1) * w * 0.6, s * W + w), (s + 1) * W - w);
          const cy = Math.min(ph.y + ph.h - h * 0.6, limit - h / 2);
          if (!clear(cx, cy)) continue;
          const pos = placeCentred(cx, cy, w, h, deg);
          elements.push(sticker(id, pos.x, pos.y, w, h, deg, tint, { shadow: { ...DOODLE_SHADOW } }, limit));
          stuck.push([cx, cy]);
          break spot;
        }
      }
    });

    if (!line) return;
    const len = line.value.length;
    const bandH = share * H;
    // The strip kept free for a caption is only so tall. Text is sized to fit in it with room to turn.
    const room = bandH - 16;
    const baseSize = Math.min(line.isTitle ? 84 : 64, Math.floor((0.7 * room) / 1.25));
    // Turned about its middle, a caption's corners must stay inside the space it has, so it can turn only so far.
    const turnFor = (w: number, h: number, space: number) => {
      const most = (Math.asin(Math.min(1, Math.max(0, (space - h) / w))) * 180) / Math.PI;
      return Math.trunc(Math.min(most, Math.max(-most, turn(theme.captionTilt))) * 10) / 10;
    };
    const cy = H - bandH / 2;
    if (theme.caption === "label") {
      // The caption sits on a torn paper label that fills the strip.
      const labelW = Math.round(Math.min(W * 0.9, Math.max(W * 0.45, len * baseSize * 0.6 + 110), 0.85 * bandH * STICKERS.label.aspect));
      const labelH = Math.round(labelW / STICKERS.label.aspect);
      const textW = Math.round(labelW * 0.84);
      const size = Math.min(baseSize, Math.max(30, Math.floor(textW / (len * 0.6))));
      const textH = Math.round(size * 1.25 * Math.max(1, Math.ceil((len * size * 0.6) / textW)));
      const deg = turnFor(labelW, labelH, bandH - 8);
      // Off-centre a little, but never so far that the turned label leaves its slide.
      const reachX = (labelW / 2) * Math.abs(Math.cos((deg * Math.PI) / 180)) + (labelH / 2) * Math.abs(Math.sin((deg * Math.PI) / 180));
      const cx = Math.min(Math.max(s * W + W * (0.5 + (rand() * 2 - 1) * 0.06), s * W + reachX), (s + 1) * W - reachX);
      const lp = placeCentred(cx, cy, labelW, labelH, deg);
      elements.push(sticker("label", lp.x, lp.y, labelW, labelH, deg, theme.labelTint, { shadow: { ...LABEL_SHADOW } }));
      const tp = placeCentred(cx, cy, textW, textH, deg);
      elements.push({
        id: newId(),
        type: "text",
        ...fitBox(tp.x, tp.y, textW, textH, deg, s * W, (s + 1) * W, H),
        w: textW,
        h: textH,
        rotation: deg,
        locked: false,
        text: { value: line.value, font: look.font, size, color: inkFor(theme.labelTint, look.ink), align: "center", bold: false },
      });
    } else {
      const w = Math.round(W * 0.88);
      // Big as the theme likes, but small enough that the line fits across the band in one row.
      const size = Math.min(baseSize, Math.max(36, Math.floor(w / (len * 0.6))));
      const h = Math.round(size * 1.25 * Math.max(1, Math.ceil((len * size * 0.6) / w)));
      const deg = turnFor(w, h, room);
      const tp = placeCentred(s * W + W / 2, cy, w, h, deg);
      elements.push({
        id: newId(),
        type: "text",
        ...fitBox(tp.x, tp.y, w, h, deg, s * W, (s + 1) * W, H),
        w,
        h,
        rotation: deg,
        locked: false,
        text: { value: line.value, font: look.font, size, color: inkFor(look.background, look.ink), align: theme.align, bold: false },
      });
    }
  });

  const tags = Object.fromEntries(photos.flatMap((p) => (p.tags ? [[p.id, p.tags] as const] : [])));
  const doc: Doc = {
    v: 1,
    background: { type: "color", value: look.background },
    elements,
    compose: { seed: opts.seed ?? 1, theme: choice, plan, tags, order: photos.map((p) => p.id) },
    ...(look.pattern === "none" ? {} : { pattern: makePattern(look.pattern, look.background, look.ink) }),
  };
  // Our own output goes through the same schema the server applies to every saved document.
  return { doc: DocSchema.parse(doc), slideCount };
}
