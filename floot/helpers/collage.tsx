import { Design, FORMATS, Layer, MAX_SLIDES, SLIDE_WIDTH, rotatedBy, uid } from "./carouselModel";
import { STICKERS, stickerSrc } from "./stickerArt";

/**
 * The collage shuffle. Photos are spread over the slides in loose, overlapping groups of one to three, in a new
 * order each time. Then a plan says which photos to tilt and where tape and little accents go. The plan comes from
 * the AI when it is available, or from randomPlan otherwise. Everything here is pure, so it can be tested.
 */

/** Places on a photo where a sticker can go, in the photo's own coordinates (0 to 1). */
export const SPOTS = {
  "tape-top": { x: 0.5, y: 0, turn: 0, kind: "tape" },
  "tape-top-left": { x: 0.04, y: 0.04, turn: -45, kind: "tape" },
  "tape-top-right": { x: 0.96, y: 0.04, turn: 45, kind: "tape" },
  "pin-top": { x: 0.5, y: 0.03, turn: 0, kind: "pin" },
  "accent-top-right": { x: 1, y: 0, turn: 0, kind: "accent" },
  "accent-bottom-left": { x: 0, y: 1, turn: 0, kind: "accent" },
  "accent-bottom-right": { x: 1, y: 1, turn: 0, kind: "accent" },
} as const;
export type Spot = keyof typeof SPOTS;
export const SPOT_NAMES = Object.keys(SPOTS) as Spot[];

/** Which stickers suit which kind of spot. */
export const STICKERS_FOR = { tape: ["tape"], pin: ["pin"], accent: ["daisy", "sparkle", "heart", "star"] } as const;
export const COLLAGE_STICKERS = ["tape", "pin", "daisy", "sparkle", "heart", "star"] as const;
export const COLLAGE_COLOURS = ["#f3ead7", "#ffffff", "#f6d94a", "#f66dbb", "#e5484d", "#8e4ec6", "#0090ff", "#30a46c"] as const;

export type PlannedSticker = { photoId: string; spot: Spot; sticker: (typeof COLLAGE_STICKERS)[number]; colour: string; extraRotation: number };
export type CollagePlan = { tilts: Record<string, number>; stickers: PlannedSticker[] };

/** A small, repeatable random number source, so a shuffle can be tested. */
export const seeded = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffled = <T,>(items: T[], rand: () => number) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Where photos sit on a slide, for one, two or three photos: left, top, width and height as shares of the slide. */
const SLOTS: Record<number, { x: number; y: number; w: number; h: number }[][]> = {
  1: [[{ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }]],
  2: [
    [
      { x: 0.06, y: 0.05, w: 0.64, h: 0.48 },
      { x: 0.3, y: 0.47, w: 0.64, h: 0.48 },
    ],
    [
      { x: 0.32, y: 0.04, w: 0.62, h: 0.5 },
      { x: 0.05, y: 0.46, w: 0.62, h: 0.5 },
    ],
  ],
  3: [
    [
      { x: 0.08, y: 0.03, w: 0.6, h: 0.36 },
      { x: 0.4, y: 0.33, w: 0.54, h: 0.34 },
      { x: 0.05, y: 0.62, w: 0.56, h: 0.35 },
    ],
    [
      { x: 0.36, y: 0.03, w: 0.58, h: 0.36 },
      { x: 0.05, y: 0.34, w: 0.54, h: 0.34 },
      { x: 0.38, y: 0.62, w: 0.56, h: 0.35 },
    ],
  ],
};

const fitInto = (aspect: number, maxW: number, maxH: number) => {
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { w: Math.round(w), h: Math.round(h) };
};

/** The photos in a design (photo layers that have a picture). Empty template frames are left where they are. */
export const photosOf = (d: Design) => d.layers.filter((l) => l.type === "image" && l.src);

/**
 * Spreads the photos over the slides in a new order, in groups of one to three, upright. Adds slides when it needs
 * them and never removes any. Removes the stickers an earlier shuffle placed. Returns the new design and the order
 * the photos ended up in.
 */
export const shuffleLayout = (d: Design, seed: number): { design: Design; order: string[] } => {
  const photos = photosOf(d);
  if (photos.length === 0) return { design: d, order: [] };
  const rand = seeded(seed);
  const order = shuffled(photos, rand);
  const H = FORMATS[d.format].height;
  const placed = new Map<string, Partial<Layer>>();
  let i = 0;
  let slide = 0;
  while (i < order.length) {
    const left = order.length - i;
    // Groups of one to three photos a slide. The last few photos share the last slide.
    const group = left <= 3 ? left : [1, 2, 2, 3, 3][Math.floor(rand() * 5)];
    const options = SLOTS[group];
    const slots = options[Math.floor(rand() * options.length)];
    for (let k = 0; k < group; k++) {
      const p = order[i + k];
      const s = slots[k];
      const jx = (rand() - 0.5) * 0.04;
      const jy = (rand() - 0.5) * 0.03;
      const aspect = (p.natural?.w ?? p.w) / (p.natural?.h ?? p.h);
      const f = fitInto(aspect, s.w * SLIDE_WIDTH, s.h * H);
      const cx = (s.x + s.w / 2 + jx) * SLIDE_WIDTH;
      const cy = (s.y + s.h / 2 + jy) * H;
      const x = Math.min(SLIDE_WIDTH - f.w, Math.max(0, cx - f.w / 2));
      const y = Math.min(H - f.h, Math.max(0, cy - f.h / 2));
      placed.set(p.id, { x: Math.round(slide * SLIDE_WIDTH + x), y: Math.round(y), w: f.w, h: f.h, rotation: 0, crop: undefined });
    }
    i += group;
    slide += 1;
  }
  // Later photos are drawn on top, so the stacking follows the new order too.
  const rank = new Map(order.map((p, k) => [p.id, k]));
  const others = d.layers.filter((l) => !rank.has(l.id) && !l.auto);
  const firstPhoto = d.layers.findIndex((l) => rank.has(l.id));
  const before = others.filter((l) => d.layers.indexOf(l) < firstPhoto);
  const after = others.filter((l) => d.layers.indexOf(l) > firstPhoto);
  const photosInOrder = order.map((p) => ({ ...p, ...placed.get(p.id) }));
  return {
    design: { ...d, slideCount: Math.min(MAX_SLIDES, Math.max(d.slideCount, slide)), layers: [...before, ...photosInOrder, ...after] },
    order: order.map((p) => p.id),
  };
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A plan without the AI: about half the photos tilted, in alternating directions, and a few stickers. */
export const randomPlan = (photoIds: string[], seed: number): CollagePlan => {
  const rand = seeded(seed ^ 0x9e3779b9);
  const tilts: Record<string, number> = {};
  let dir = rand() < 0.5 ? -1 : 1;
  for (const id of photoIds) {
    if (rand() < 0.6) {
      tilts[id] = Math.round(dir * (2 + rand() * 5) * 10) / 10;
      dir = -dir;
    } else tilts[id] = 0;
  }
  const stickers: PlannedSticker[] = [];
  for (const id of photoIds) {
    const r = rand();
    if (r < 0.45) stickers.push({ photoId: id, spot: rand() < 0.5 ? "tape-top" : rand() < 0.5 ? "tape-top-left" : "tape-top-right", sticker: "tape", colour: "#f3ead7", extraRotation: Math.round((rand() - 0.5) * 10) });
    else if (r < 0.6) stickers.push({ photoId: id, spot: "pin-top", sticker: "pin", colour: COLLAGE_COLOURS[2 + Math.floor(rand() * 6)], extraRotation: 0 });
    if (rand() < 0.35) {
      const accent = (["daisy", "sparkle", "heart"] as const)[Math.floor(rand() * 3)];
      stickers.push({ photoId: id, spot: (["accent-top-right", "accent-bottom-left", "accent-bottom-right"] as const)[Math.floor(rand() * 3)], sticker: accent, colour: accent === "daisy" ? "#ffffff" : COLLAGE_COLOURS[2 + Math.floor(rand() * 6)], extraRotation: Math.round((rand() - 0.5) * 30) });
    }
  }
  return { tilts, stickers };
};

/**
 * Makes a plan safe to use: tilts held to 12 degrees either way, stickers only on photos that exist, only in spots
 * that suit them, at most 4 per photo, and a valid colour.
 */
export const cleanPlan = (plan: CollagePlan, photoIds: string[]): CollagePlan => {
  const ids = new Set(photoIds);
  const tilts: Record<string, number> = {};
  for (const id of photoIds) tilts[id] = Math.round(clamp(Number(plan.tilts[id]) || 0, -12, 12) * 10) / 10;
  const perPhoto = new Map<string, number>();
  const stickers = plan.stickers.filter((s) => {
    const spot = SPOTS[s.spot as Spot];
    if (!ids.has(s.photoId) || !spot) return false;
    if (!(STICKERS_FOR[spot.kind] as readonly string[]).includes(s.sticker)) return false;
    const n = (perPhoto.get(s.photoId) ?? 0) + 1;
    perPhoto.set(s.photoId, n);
    return n <= 4;
  });
  return {
    tilts,
    stickers: stickers.map((s) => ({ ...s, colour: /^#[0-9a-fA-F]{6}$/.test(s.colour) ? s.colour : "#f3ead7", extraRotation: clamp(Number(s.extraRotation) || 0, -40, 40) })),
  };
};

/** Turns a point on a layer (in its own pixels) into canvas pixels, allowing for the layer's turn about its corner. */
const onCanvas = (l: Pick<Layer, "x" | "y" | "rotation">, lx: number, ly: number) => {
  const a = (l.rotation * Math.PI) / 180;
  return { x: l.x + lx * Math.cos(a) - ly * Math.sin(a), y: l.y + lx * Math.sin(a) + ly * Math.cos(a) };
};

const STICKER_SIZE = { tape: 230, pin: 70, daisy: 150, sparkle: 110, heart: 110, star: 110 } as const;

/** Applies a plan to a shuffled design: tilts photos about their middles and adds the planned stickers on top. */
export const applyPlan = (d: Design, plan: CollagePlan, newId: () => string = uid): Design => {
  const tilted = d.layers.map((l) => {
    const deg = plan.tilts[l.id];
    return deg ? { ...l, ...rotatedBy({ ...l, rotation: 0 }, deg) } : l;
  });
  const byId = new Map(tilted.map((l) => [l.id, l]));
  const stickers: Layer[] = [];
  for (const s of plan.stickers) {
    const photo = byId.get(s.photoId);
    const art = STICKERS.find((x) => x.id === s.sticker);
    if (!photo || !art) continue;
    const spot = SPOTS[s.spot];
    const long = STICKER_SIZE[s.sticker];
    const k = long / Math.max(art.w, art.h);
    const w = Math.round(art.w * k);
    const h = Math.round(art.h * k);
    const centre = onCanvas(photo, spot.x * photo.w, spot.y * photo.h);
    const rotation = Math.round((photo.rotation + spot.turn + s.extraRotation) * 10) / 10;
    // The sticker turns about its own corner too, so start from its middle and work back to the corner.
    const corner = onCanvas({ x: 0, y: 0, rotation }, w / 2, h / 2);
    stickers.push({
      id: newId(),
      type: "sticker",
      name: art.name,
      sticker: s.sticker,
      color: s.colour,
      src: stickerSrc(s.sticker, s.colour),
      x: Math.round(centre.x - corner.x),
      y: Math.round(centre.y - corner.y),
      w,
      h,
      rotation,
      locked: false,
      auto: true,
    });
  }
  return { ...d, layers: [...tilted, ...stickers] };
};
