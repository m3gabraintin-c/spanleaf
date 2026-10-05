import { z } from "zod";
import { DocSchema, uid, type Doc, type Element } from "./doc";
import { FORMATS, type FormatKey } from "./formats";
import { coverCrop, seeded } from "./geometry";

/**
 * Turns a set of photos into a scrapbook-style carousel document. The model only makes taste decisions
 * (see ComposePlanSchema). Every position, size, rotation and crop comes from the arithmetic here, so
 * the result is always inside the artboard and always passes DocSchema.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Strips control characters and collapses whitespace, so model text can't smuggle in line breaks or escapes. */
export const cleanText = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
const text = (max: number) => z.string().transform(cleanText).pipe(z.string().max(max));

export const PhotoTagsSchema = z.object({
  subject: text(60),
  mood: text(40),
  /** The photo's main colours, most common first. */
  palette: z.array(hex).min(1).max(4),
  /** Where the eye goes, as fractions of the photo. A crop is centred here. */
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  /** The photo that should be shown biggest. At most one is honoured. */
  hero: z.boolean().optional(),
});

export const CAPTION_FONTS = ["permanent-marker", "caveat", "dancing-script", "playfair-display", "dm-serif-display", "inter", "dm-sans"] as const;

export const ComposePlanSchema = z.object({
  style: z.enum(["scrapbook", "editorial", "clean"]),
  background: hex,
  pattern: z.enum(["grid", "dots", "lines", "none"]),
  /** Preferred caption colour. Replaced by black or white if it can't be read on the background. */
  ink: hex,
  font: z.enum(CAPTION_FONTS),
  title: text(40).optional(),
  captions: z.array(text(40).pipe(z.string().min(1))).max(6),
});

export type PhotoTags = z.infer<typeof PhotoTagsSchema>;
export type ComposePlan = z.infer<typeof ComposePlanSchema>;

export const ModelOutputSchema = z.object({ photos: z.array(PhotoTagsSchema), plan: ComposePlanSchema });
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

/** Used when the model is unavailable or returns something unusable. Plain, but still a finished carousel. */
export const FALLBACK_PLAN: ComposePlan = {
  style: "scrapbook",
  background: "#f4f1ea",
  pattern: "grid",
  ink: "#2b2b2b",
  font: "permanent-marker",
  captions: [],
};
export const FALLBACK_TAGS: PhotoTags = { subject: "", mood: "", palette: ["#888888"], focus: { x: 0.5, y: 0.5 } };

// ---- colour helpers --------------------------------------------------------------------------

const rgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (h: string) => {
  const [r, g, b] = rgb(h);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
export const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));

/** The preferred colour if it reads on the background, otherwise black or white, whichever reads better. */
export function inkFor(background: string, preferred: string) {
  if (contrast(background, preferred) >= 3) return preferred;
  return contrast(background, "#111111") >= contrast(background, "#ffffff") ? "#111111" : "#ffffff";
}

// ---- layout ----------------------------------------------------------------------------------

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Overlapping cells for the scrapbook look. Fractions of one slide. The list order is the stacking order. */
const LOOSE: Cell[][] = [
  [],
  [{ x: 0.07, y: 0.09, w: 0.86, h: 0.72 }],
  [{ x: 0.06, y: 0.07, w: 0.62, h: 0.5 }, { x: 0.34, y: 0.45, w: 0.6, h: 0.46 }],
  [{ x: 0.05, y: 0.06, w: 0.62, h: 0.44 }, { x: 0.38, y: 0.36, w: 0.56, h: 0.4 }, { x: 0.06, y: 0.62, w: 0.4, h: 0.3 }],
  [{ x: 0.04, y: 0.05, w: 0.54, h: 0.38 }, { x: 0.5, y: 0.14, w: 0.44, h: 0.32 }, { x: 0.07, y: 0.46, w: 0.4, h: 0.34 }, { x: 0.44, y: 0.58, w: 0.5, h: 0.36 }],
  [{ x: 0.04, y: 0.04, w: 0.46, h: 0.3 }, { x: 0.52, y: 0.08, w: 0.44, h: 0.34 }, { x: 0.05, y: 0.38, w: 0.42, h: 0.28 }, { x: 0.46, y: 0.44, w: 0.48, h: 0.28 }, { x: 0.2, y: 0.7, w: 0.58, h: 0.26 }],
];

/** The same counts with gutters and no overlap, for the cleaner styles. */
const TIDY: Cell[][] = [
  [],
  [{ x: 0.08, y: 0.1, w: 0.84, h: 0.7 }],
  [{ x: 0.06, y: 0.06, w: 0.88, h: 0.42 }, { x: 0.06, y: 0.52, w: 0.88, h: 0.42 }],
  [{ x: 0.06, y: 0.06, w: 0.88, h: 0.44 }, { x: 0.06, y: 0.54, w: 0.42, h: 0.4 }, { x: 0.52, y: 0.54, w: 0.42, h: 0.4 }],
  [{ x: 0.06, y: 0.06, w: 0.42, h: 0.42 }, { x: 0.52, y: 0.06, w: 0.42, h: 0.42 }, { x: 0.06, y: 0.52, w: 0.42, h: 0.42 }, { x: 0.52, y: 0.52, w: 0.42, h: 0.42 }],
  [{ x: 0.06, y: 0.05, w: 0.88, h: 0.3 }, { x: 0.06, y: 0.39, w: 0.28, h: 0.27 }, { x: 0.36, y: 0.39, w: 0.28, h: 0.27 }, { x: 0.66, y: 0.39, w: 0.28, h: 0.27 }, { x: 0.06, y: 0.7, w: 0.88, h: 0.25 }],
];

const MAX_PER_SLIDE = 5;
const TARGET_PER_SLIDE = 3;
/** How far the right-most photo on a slide runs over the edge into the next one, as a fraction of a slide. */
const BRIDGE = 0.08;
/** The share of a slide kept free at the bottom for a caption, on slides that have one. */
const BAND = 0.11;

const STYLES = {
  scrapbook: {
    cells: LOOSE,
    tilt: 4,
    masks: ["torn", "rect", "rounded", "torn"] as const,
    outline: { color: "#ffffff", width: 10 },
    shadow: { color: "#000000", blur: 24, x: 0, y: 10, opacity: 0.22 },
    textTilt: 2,
    align: "left" as const,
  },
  editorial: { cells: TIDY, tilt: 0, masks: ["rect"] as const, outline: null, shadow: null, textTilt: 0, align: "center" as const },
  clean: {
    cells: TIDY,
    tilt: 0,
    masks: ["rounded"] as const,
    outline: null,
    shadow: { color: "#000000", blur: 18, x: 0, y: 6, opacity: 0.14 },
    textTilt: 0,
    align: "center" as const,
  },
};

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
  maxSlides: number;
  /** Same seed, same carousel. A different seed shuffles tilt, torn edges and which photo goes where. */
  seed?: number;
  newId?: () => string;
}

/** How many slides n photos get: about three each, never more than five, never more than the plan allows. */
export function slidesFor(n: number, maxSlides: number) {
  const wanted = Math.max(Math.ceil(n / TARGET_PER_SLIDE), Math.ceil(n / MAX_PER_SLIDE), 1);
  if (wanted > maxSlides) throw new Error(`${n} photos don't fit in ${maxSlides} slides.`);
  return wanted;
}

const aspectGap = (photo: LayoutPhoto, cell: Cell, slideAspect: number) => Math.abs(Math.log(photo.width / photo.height / ((cell.w / cell.h) * slideAspect)));

/** Gives each cell, biggest first, the unused photo whose shape is closest. The hero photo goes in the biggest. */
function assign(group: LayoutPhoto[], cells: Cell[], slideAspect: number): LayoutPhoto[] {
  const order = cells.map((_, i) => i).sort((a, b) => cells[b].w * cells[b].h - cells[a].w * cells[a].h);
  const left = [...group];
  const out: LayoutPhoto[] = new Array(cells.length);
  order.forEach((ci, rank) => {
    let pick = rank === 0 ? left.findIndex((p) => p.tags?.hero) : -1;
    if (pick < 0) {
      let best = Infinity;
      left.forEach((p, i) => {
        const gap = aspectGap(p, cells[ci], slideAspect);
        if (gap < best) ((best = gap), (pick = i));
      });
    }
    out[ci] = left.splice(pick, 1)[0];
  });
  return out;
}

export function layoutCarousel(photos: LayoutPhoto[], plan: ComposePlan, opts: LayoutOptions): { doc: Doc; slideCount: number } {
  if (photos.length === 0) throw new Error("Add at least one photo.");
  const f = FORMATS[opts.format];
  const W = f.width;
  const H = f.height;
  const style = STYLES[plan.style];
  const rand = seeded(opts.seed ?? 1);
  const newId = opts.newId ?? uid;
  const slideCount = slidesFor(photos.length, opts.maxSlides);
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

  // At most one line of text per slide, spread evenly. A title, if there is one, goes first.
  const lines = [plan.title, ...plan.captions].filter((t): t is string => !!t).slice(0, slideCount);
  const textOn = new Map<number, { value: string; isTitle: boolean }>();
  lines.forEach((value, j) => textOn.set(Math.floor((j * slideCount) / lines.length), { value, isTitle: j === 0 && !!plan.title }));

  const heroOnce = photos.findIndex((p) => p.tags?.hero);
  const elements: Element[] = [];
  const bg = plan.background;
  const ink = inkFor(bg, plan.ink);
  let maskTurn = Math.floor(rand() * style.masks.length);

  groups.forEach((group, s) => {
    const band = textOn.has(s) ? BAND : 0;
    const cells = style.cells[group.length].map((c) => ({ ...c, y: c.y * (1 - band), h: c.h * (1 - band) }));
    const placed = assign(
      // Only the first hero counts, so a model that flags every photo can't make them all compete.
      group.map((p) => (p.tags?.hero && photos.indexOf(p) !== heroOnce ? { ...p, tags: { ...p.tags, hero: false } } : p)),
      cells,
      W / H,
    );

    // The right-most photo on every slide but the last runs over the edge, so slides read as one strip.
    let bridge = -1;
    if (s < slideCount - 1 && group.length >= 2) {
      bridge = cells.reduce((best, c, i) => (c.x + c.w > cells[best].x + cells[best].w ? i : best), 0);
    }

    cells.forEach((cell, i) => {
      const photo = placed[i];
      const w = Math.round(cell.w * W);
      const h = Math.round(cell.h * H);
      let x = s * W + cell.x * W;
      if (i === bridge) x = s * W + (1 + BRIDGE - cell.w) * W;
      x = Math.round(Math.min(Math.max(0, x), totalW - w));
      const mask = style.masks[maskTurn++ % style.masks.length];
      const el: Element = {
        id: newId(),
        type: "image",
        x,
        y: Math.round(cell.y * H),
        w,
        h,
        rotation: style.tilt ? Math.round((rand() * 2 - 1) * style.tilt * 10) / 10 : 0,
        locked: false,
        mediaId: photo.id,
        crop: coverCrop(photo.width, photo.height, w, h, photo.tags?.focus),
        mask: mask === "torn" ? { shape: "torn", seed: Math.floor(rand() * 1_000_000) } : mask === "rounded" ? { shape: "rounded", radius: 0.06 } : { shape: "rect" },
      };
      if (photo.name) el.name = photo.name.slice(0, 200);
      if (style.outline) el.outline = { ...style.outline };
      if (style.shadow) el.shadow = { ...style.shadow };
      elements.push(el);
    });

    const line = textOn.get(s);
    if (line) {
      const w = Math.round(W * 0.88);
      // Big as the style likes, but small enough that the line fits across the band in one row.
      const size = Math.min(line.isTitle ? 84 : 64, Math.max(36, Math.floor(w / (line.value.length * 0.6))));
      const rows = Math.max(1, Math.ceil((line.value.length * size * 0.6) / w));
      elements.push({
        id: newId(),
        type: "text",
        x: Math.round(s * W + W * 0.06),
        y: Math.round(H * (1 - BAND) + H * 0.01),
        w,
        h: Math.round(size * 1.25 * rows),
        rotation: style.textTilt ? Math.round((rand() * 2 - 1) * style.textTilt * 10) / 10 : 0,
        locked: false,
        text: { value: line.value, font: plan.font, size, color: ink, align: style.align, bold: false },
      });
    }
  });

  const doc: Doc = {
    v: 1,
    background: { type: "color", value: bg },
    elements,
    ...(plan.pattern === "none"
      ? {}
      : {
          pattern: {
            kind: plan.pattern,
            color: mix(bg, ink, 0.12),
            size: plan.pattern === "dots" ? 40 : 54,
            thickness: plan.pattern === "dots" ? 2 : 1.2,
          },
        }),
  };
  // Our own output goes through the same schema the server applies to every saved document.
  return { doc: DocSchema.parse(doc), slideCount };
}
