import { Design, FORMATS, Layer, SLIDE_WIDTH } from "./carouselModel";

export type Theme = {
  id: string;
  name: string;
  blurb: string;
  background: string;
  gradient: { from: string; to: string; angle: number } | null;
  border: { color: string; width: number } | null;
  radius: number;
  shadow: boolean;
  tilt: number;
  fontFamily: string;
  ink: string;
};

export const THEMES: Theme[] = [
  { id: "scrapbook", name: "Scrapbook", blurb: "Paper, white borders, a little tilt", background: "#efe6d2", gradient: null, border: { color: "#ffffff", width: 14 }, radius: 0, shadow: true, tilt: 3, fontFamily: "Fraunces", ink: "#3b3226" },
  { id: "polaroid", name: "Polaroid", blurb: "Thick white frames on warm paper", background: "#f3efe6", gradient: null, border: { color: "#ffffff", width: 24 }, radius: 2, shadow: true, tilt: 2, fontFamily: "Inter Tight", ink: "#2a2a2a" },
  { id: "dreamy", name: "Dreamy", blurb: "Soft gradient, rounded corners", background: "#f8d7e8", gradient: { from: "#f8d7e8", to: "#cfe3ff", angle: 90 }, border: null, radius: 44, shadow: true, tilt: 0, fontFamily: "Fraunces", ink: "#3a3350" },
  { id: "editorial", name: "Editorial", blurb: "Square edges, quiet paper, serif", background: "#fbf9f4", gradient: null, border: null, radius: 0, shadow: false, tilt: 0, fontFamily: "Fraunces", ink: "#1d211e" },
  { id: "clean", name: "Clean", blurb: "White, gently rounded, no fuss", background: "#ffffff", gradient: null, border: null, radius: 14, shadow: false, tilt: 0, fontFamily: "Inter Tight", ink: "#1d211e" },
  { id: "film", name: "Film", blurb: "Dark ground, thin light frames", background: "#141414", gradient: null, border: { color: "#f5f0e6", width: 6 }, radius: 2, shadow: false, tilt: 0, fontFamily: "Inter Tight", ink: "#f5f0e6" },
];

/** A repeatable number between -1 and 1 for the nth photo, so the same theme always tilts the same way. */
const jitter = (i: number) => Math.sin((i + 1) * 12.9898) * 0.9999;

/** Gives every photo, sticker and text the look of a theme. Positions are not changed, except for the tilt. */
export const applyTheme = (d: Design, id: string): Design => {
  const t = THEMES.find((x) => x.id === id);
  if (!t) return d;
  let n = 0;
  const layers: Layer[] = d.layers.map((l) => {
    if (l.type === "image") {
      const i = n++;
      return {
        ...l,
        radius: t.radius,
        border: t.border,
        shadow: t.shadow,
        rotation: t.tilt ? Math.round(jitter(i) * t.tilt * 100) / 100 : 0,
      };
    }
    if (l.type === "text") return { ...l, fontFamily: t.fontFamily, color: t.ink };
    return l;
  });
  return { ...d, background: t.background, gradient: t.gradient, layers };
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
