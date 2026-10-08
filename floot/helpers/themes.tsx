import { Adjust, Design, FORMATS, Layer, MAX_LAYERS, Pattern, SLIDE_WIDTH, uid } from "./carouselModel";
import { STICKERS, stickerSrc } from "./stickerArt";

export type Decor = { sticker: string; colour: string };

export type Theme = {
  id: string;
  name: string;
  blurb: string;
  background: string;
  gradient: { from: string; to: string; angle: number } | null;
  pattern: Pattern | null;
  border: { color: string; width: number } | null;
  radius: number;
  shadow: boolean;
  tilt: number;
  adjust: Adjust | null;
  fontFamily: string;
  ink: string;
  /** Little decorations scattered near the corners of each slide. */
  decor: Decor[];
};

const WARM: Adjust = { brightness: 6, contrast: 0, saturation: 12 };
const FADE: Adjust = { brightness: 10, contrast: -20, saturation: -20 };
const VIVID: Adjust = { brightness: 0, contrast: 15, saturation: 35 };

export const THEMES: Theme[] = [
  {
    id: "scrapbook",
    name: "Scrapbook",
    blurb: "Kraft paper with grid lines, white borders, tape and daisies",
    background: "#e9dcc3",
    gradient: null,
    pattern: { kind: "grid", color: "#b9a37c", opacity: 0.35 },
    border: { color: "#ffffff", width: 14 },
    radius: 0,
    shadow: true,
    tilt: 3,
    adjust: null,
    fontFamily: "Fraunces",
    ink: "#3b3226",
    decor: [
      { sticker: "tape", colour: "#f3ead7" },
      { sticker: "daisy", colour: "#ffffff" },
      { sticker: "pin", colour: "#e5484d" },
    ],
  },
  {
    id: "polaroid",
    name: "Polaroid",
    blurb: "Thick white frames on grainy warm paper, pinned up",
    background: "#f3efe6",
    gradient: null,
    pattern: { kind: "grain", color: "#8a7f6a", opacity: 0.35 },
    border: { color: "#ffffff", width: 26 },
    radius: 2,
    shadow: true,
    tilt: 2,
    adjust: null,
    fontFamily: "Inter Tight",
    ink: "#2a2a2a",
    decor: [
      { sticker: "pin", colour: "#0090ff" },
      { sticker: "tape", colour: "#ffffff" },
    ],
  },
  {
    id: "dreamy",
    name: "Dreamy",
    blurb: "Pink to blue sky, white dots, round corners, sparkles and hearts",
    background: "#f8d7e8",
    gradient: { from: "#f8d7e8", to: "#cfe3ff", angle: 90 },
    pattern: { kind: "dots", color: "#ffffff", opacity: 0.7 },
    border: null,
    radius: 44,
    shadow: true,
    tilt: 0,
    adjust: null,
    fontFamily: "Fraunces",
    ink: "#3a3350",
    decor: [
      { sticker: "sparkle", colour: "#ffffff" },
      { sticker: "heart", colour: "#f66dbb" },
    ],
  },
  {
    id: "editorial",
    name: "Editorial",
    blurb: "Quiet ruled paper, square edges, a serif headline and one ink squiggle",
    background: "#fbf9f4",
    gradient: null,
    pattern: { kind: "lines", color: "#cfc6b4", opacity: 0.5 },
    border: null,
    radius: 0,
    shadow: false,
    tilt: 0,
    adjust: null,
    fontFamily: "Fraunces",
    ink: "#1d211e",
    decor: [{ sticker: "squiggle", colour: "#1d211e" }],
  },
  {
    id: "clean",
    name: "Clean",
    blurb: "White, gently rounded, nothing in the way of the photos",
    background: "#ffffff",
    gradient: null,
    pattern: null,
    border: null,
    radius: 14,
    shadow: false,
    tilt: 0,
    adjust: null,
    fontFamily: "Inter Tight",
    ink: "#1d211e",
    decor: [],
  },
  {
    id: "film",
    name: "Film",
    blurb: "Dark grainy ground, thin cream frames, faded colour like old prints",
    background: "#141414",
    gradient: null,
    pattern: { kind: "grain", color: "#ffffff", opacity: 0.18 },
    border: { color: "#f5f0e6", width: 6 },
    radius: 2,
    shadow: false,
    tilt: 0,
    adjust: FADE,
    fontFamily: "Inter Tight",
    ink: "#f5f0e6",
    decor: [{ sticker: "dots", colour: "#f5f0e6" }],
  },
  {
    id: "botanical",
    name: "Botanical",
    blurb: "Sage green with soft dots, white borders, daisies and leaves",
    background: "#dfe7d6",
    gradient: null,
    pattern: { kind: "dots", color: "#a9bb98", opacity: 0.5 },
    border: { color: "#ffffff", width: 12 },
    radius: 6,
    shadow: true,
    tilt: 2,
    adjust: null,
    fontFamily: "Fraunces",
    ink: "#2f4a2f",
    decor: [
      { sticker: "daisy", colour: "#ffffff" },
      { sticker: "drop", colour: "#6f8f5e" },
    ],
  },
  {
    id: "sunset",
    name: "Sunset",
    blurb: "Peach to pink glow, rounded white frames, a sun and sparkles",
    background: "#ffb38a",
    gradient: { from: "#ffb38a", to: "#ff6f91", angle: 120 },
    pattern: null,
    border: { color: "#ffffff", width: 10 },
    radius: 18,
    shadow: true,
    tilt: 2,
    adjust: WARM,
    fontFamily: "Fraunces",
    ink: "#4a1e2c",
    decor: [
      { sticker: "circle", colour: "#ffd166" },
      { sticker: "sparkle", colour: "#fff6d5" },
    ],
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "Deep navy to violet, starry dots, gold stars",
    background: "#0f1b3d",
    gradient: { from: "#0f1b3d", to: "#2a1b4d", angle: 90 },
    pattern: { kind: "dots", color: "#ffffff", opacity: 0.18 },
    border: null,
    radius: 8,
    shadow: true,
    tilt: 0,
    adjust: null,
    fontFamily: "Fraunces",
    ink: "#f5f0e6",
    decor: [
      { sticker: "star", colour: "#f6d94a" },
      { sticker: "sparkle", colour: "#ffffff" },
    ],
  },
  {
    id: "retro",
    name: "Retro 70s",
    blurb: "Cream with mustard stripes, brown frames, warm colour, circles and squiggles",
    background: "#f4e3c1",
    gradient: null,
    pattern: { kind: "stripes", color: "#e9a23b", opacity: 0.22 },
    border: { color: "#3b2a1a", width: 8 },
    radius: 0,
    shadow: false,
    tilt: 4,
    adjust: WARM,
    fontFamily: "Courier New",
    ink: "#3b2a1a",
    decor: [
      { sticker: "circle", colour: "#e86a33" },
      { sticker: "squiggle", colour: "#3b8b7b" },
    ],
  },
  {
    id: "y2k",
    name: "Y2K",
    blurb: "Lilac to mint, checkerboard, bubbly corners, hearts, stars and sparkles",
    background: "#c8b6ff",
    gradient: { from: "#c8b6ff", to: "#b8f2e6", angle: 135 },
    pattern: { kind: "checks", color: "#ffffff", opacity: 0.25 },
    border: { color: "#ffffff", width: 10 },
    radius: 30,
    shadow: true,
    tilt: 3,
    adjust: VIVID,
    fontFamily: "Inter Tight",
    ink: "#3a2b6b",
    decor: [
      { sticker: "heart", colour: "#ff70a6" },
      { sticker: "star", colour: "#ffd670" },
      { sticker: "sparkle", colour: "#ffffff" },
    ],
  },
  {
    id: "seaside",
    name: "Seaside",
    blurb: "Pale sea blue with beach-hut stripes, white frames, drops and a sun",
    background: "#e8f4f8",
    gradient: null,
    pattern: { kind: "stripes", color: "#9fd3e6", opacity: 0.35 },
    border: { color: "#ffffff", width: 16 },
    radius: 4,
    shadow: true,
    tilt: 2,
    adjust: null,
    fontFamily: "Inter Tight",
    ink: "#1d3d4a",
    decor: [
      { sticker: "drop", colour: "#4aa3c9" },
      { sticker: "circle", colour: "#ffd166" },
    ],
  },
  {
    id: "love",
    name: "Love Letter",
    blurb: "Blush grid paper, pink tape and red hearts",
    background: "#fde2e4",
    gradient: null,
    pattern: { kind: "grid", color: "#f3a6b3", opacity: 0.45 },
    border: { color: "#ffffff", width: 12 },
    radius: 0,
    shadow: true,
    tilt: 3,
    adjust: null,
    fontFamily: "Fraunces",
    ink: "#7a1f35",
    decor: [
      { sticker: "heart", colour: "#e5484d" },
      { sticker: "tape", colour: "#fff1f3" },
    ],
  },
  {
    id: "neon",
    name: "Neon",
    blurb: "Black grid, hot pink frames, electric green and blue sparkles",
    background: "#0b0b0f",
    gradient: null,
    pattern: { kind: "grid", color: "#3a3a5a", opacity: 0.8 },
    border: { color: "#ff2bd6", width: 6 },
    radius: 12,
    shadow: false,
    tilt: 0,
    adjust: VIVID,
    fontFamily: "Inter Tight",
    ink: "#ffffff",
    decor: [
      { sticker: "sparkle", colour: "#39ff14" },
      { sticker: "star", colour: "#00e5ff" },
    ],
  },
  {
    id: "vintage",
    name: "Vintage",
    blurb: "Old grainy paper, faded prints, typewriter text, tape and pins",
    background: "#efe1c6",
    gradient: null,
    pattern: { kind: "grain", color: "#7a6648", opacity: 0.4 },
    border: { color: "#fffaf0", width: 18 },
    radius: 0,
    shadow: true,
    tilt: 2,
    adjust: FADE,
    fontFamily: "Courier New",
    ink: "#4a3a28",
    decor: [
      { sticker: "tape", colour: "#e8d3a9" },
      { sticker: "pin", colour: "#8e4ec6" },
    ],
  },
  {
    id: "coffee",
    name: "Coffee",
    blurb: "Latte tones with dots, cream frames, brown hearts and drops",
    background: "#d8c3a5",
    gradient: null,
    pattern: { kind: "dots", color: "#b08d62", opacity: 0.45 },
    border: { color: "#f5ecdc", width: 14 },
    radius: 6,
    shadow: true,
    tilt: 2,
    adjust: WARM,
    fontFamily: "Fraunces",
    ink: "#3e2c20",
    decor: [
      { sticker: "heart", colour: "#6f4e37" },
      { sticker: "drop", colour: "#6f4e37" },
    ],
  },
];

/** A repeatable number between -1 and 1 for the nth item, so the same theme always looks the same. */
const jitter = (i: number) => Math.sin((i + 1) * 12.9898) * 0.9999;

/** Spots near the edges of a slide where decorations go, as shares of its width and height. */
const DECOR_SPOTS = [
  { x: 0.07, y: 0.05 },
  { x: 0.92, y: 0.07 },
  { x: 0.09, y: 0.93 },
  { x: 0.9, y: 0.92 },
  { x: 0.95, y: 0.5 },
  { x: 0.04, y: 0.48 },
];

/** At most this many slides get decorations, so a long project stays within the layer limit. */
const DECOR_SLIDES = 40;

/**
 * Gives the carousel the look of a theme: background, gradient and pattern, every photo's frame, corners, shadow,
 * tilt and colour, every text's font and colour, and a few decorations near the edges of each slide. Positions are
 * not changed, except for the tilt. Decorations from an earlier theme are replaced; your own stickers are kept.
 */
export const applyTheme = (d: Design, id: string, newId: () => string = uid): Design => {
  const t = THEMES.find((x) => x.id === id);
  if (!t) return d;
  let n = 0;
  const layers: Layer[] = d.layers
    .filter((l) => !l.themeDecor)
    .map((l) => {
      if (l.type === "image") {
        const i = n++;
        return {
          ...l,
          radius: t.radius,
          border: t.border,
          shadow: t.shadow,
          adjust: t.adjust,
          rotation: t.tilt ? Math.round(jitter(i) * t.tilt * 100) / 100 : 0,
        };
      }
      if (l.type === "text") return { ...l, fontFamily: t.fontFamily, color: t.ink };
      return l;
    });

  const H = FORMATS[d.format].height;
  const decor: Layer[] = [];
  if (t.decor.length) {
    const room = MAX_LAYERS - layers.length;
    for (let slide = 0; slide < Math.min(d.slideCount, DECOR_SLIDES); slide++) {
      const count = 2 + (Math.abs(jitter(slide * 7)) > 0.5 ? 1 : 0);
      for (let k = 0; k < count && decor.length < room; k++) {
        const pick = t.decor[(slide + k) % t.decor.length];
        const art = STICKERS.find((s) => s.id === pick.sticker);
        if (!art) continue;
        const spot = DECOR_SPOTS[(slide * 2 + k * 3) % DECOR_SPOTS.length];
        const long = pick.sticker === "tape" || pick.sticker === "squiggle" ? 220 : pick.sticker === "pin" ? 70 : 110 + Math.round(Math.abs(jitter(slide + k)) * 50);
        const scale = long / Math.max(art.w, art.h);
        const w = Math.round(art.w * scale);
        const h = Math.round(art.h * scale);
        decor.push({
          id: newId(),
          type: "sticker",
          name: art.name,
          sticker: pick.sticker,
          color: pick.colour,
          src: stickerSrc(pick.sticker, pick.colour),
          x: Math.round(slide * SLIDE_WIDTH + spot.x * SLIDE_WIDTH - w / 2),
          y: Math.round(spot.y * H - h / 2),
          w,
          h,
          rotation: Math.round(jitter(slide * 3 + k) * 25),
          locked: false,
          themeDecor: true,
        });
      }
    }
  }
  return { ...d, background: t.background, gradient: t.gradient, pattern: t.pattern, layers: [...layers, ...decor] };
};

type Photo = Layer;

const fit = (p: Photo, maxW: number, maxH: number) => {
  const aspect = (p.natural?.w ?? p.w) / (p.natural?.h ?? p.h);
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { w: Math.round(w), h: Math.round(h) };
};

/**
 * Lays the photos out across the slides, in the order they were added, in a repeating rhythm: one large photo,
 * two stacked, then one that runs across the edge into the next slide. Adds the slides it needs. Text and
 * stickers stay where they are.
 */
export const arrangePhotos = (d: Design): Design => {
  const photos = d.layers.filter((l) => l.type === "image");
  if (photos.length === 0) return d;
  const H = FORMATS[d.format].height;
  const placed = new Map<string, Partial<Layer>>();
  const rhythm = ["one", "two", "bridge", "one", "two"] as const;
  let slide = 0;
  let step = 0;
  let i = 0;
  while (i < photos.length) {
    const kind = rhythm[step % rhythm.length];
    const left = slide * SLIDE_WIDTH;
    if (kind === "two" && i + 1 < photos.length) {
      [photos[i], photos[i + 1]].forEach((p, k) => {
        const f = fit(p, SLIDE_WIDTH * 0.78, H * 0.42);
        placed.set(p.id, { ...f, x: left + Math.round((SLIDE_WIDTH - f.w) / 2), y: Math.round(H * (k === 0 ? 0.06 : 0.52)) + Math.round((H * 0.42 - f.h) / 2), rotation: 0 });
      });
      i += 2;
      slide += 1;
    } else if (kind === "bridge" && i < photos.length) {
      const f = fit(photos[i], SLIDE_WIDTH * 1.55, H * 0.7);
      placed.set(photos[i].id, { ...f, x: left + SLIDE_WIDTH - Math.round(f.w / 2), y: Math.round((H - f.h) / 2), rotation: 0 });
      i += 1;
      slide += 2;
    } else {
      const f = fit(photos[i], SLIDE_WIDTH * 0.86, H * 0.8);
      placed.set(photos[i].id, { ...f, x: left + Math.round((SLIDE_WIDTH - f.w) / 2), y: Math.round((H - f.h) / 2), rotation: 0 });
      i += 1;
      slide += 1;
    }
    step += 1;
  }
  const lastEdge = Math.max(...[...placed.values()].map((p) => ((p.x ?? 0) + (p.w ?? 0)) / SLIDE_WIDTH));
  const needed = Math.max(1, Math.ceil(lastEdge - 0.001), slide > 0 ? Math.min(slide, Math.ceil(lastEdge)) : 1);
  return {
    ...d,
    slideCount: Math.min(500, Math.max(d.slideCount, needed)),
    layers: d.layers.map((l) => (placed.has(l.id) ? { ...l, ...placed.get(l.id), crop: undefined } : l)),
  };
};
