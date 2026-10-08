/**
 * The carousel model: one wide canvas of slides, layers placed on it, and the
 * pure operations that change them. No React and no storage in here.
 */

export const SLIDE_WIDTH = 1080;
export const MAX_SLIDES = 500;
export const MAX_LAYERS = 500;

export const FORMATS = {
  portrait_4_5: { label: "4:5", name: "Portrait", height: 1350 },
  portrait_3_4: { label: "3:4", name: "Tall", height: 1440 },
  square: { label: "1:1", name: "Square", height: 1080 },
  story_9_16: { label: "9:16", name: "Story", height: 1920 },
} as const;

export type FormatKey = keyof typeof FORMATS;
export const FORMAT_KEYS = Object.keys(FORMATS) as FormatKey[];

export type Gradient = { from: string; to: string; angle: number };

export type Crop = { zoom: number; x: number; y: number };
export type Adjust = { brightness: number; contrast: number; saturation: number };
export type StrokeData = { color: string; width: number; points: number[] };

export type Layer = {
  id: string;
  type: "image" | "text" | "sticker" | "drawing" | "video";
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  locked: boolean;
  /** Image and sticker layers: the picture, as a data address. */
  src?: string;
  /** Video layers: the clip is kept apart from the project (it can be large), under this key. */
  mediaKey?: string;
  /** Video layers: the clip's length in seconds. */
  duration?: number;
  /** Image layers: the picture's own size, so a crop can be worked out. */
  natural?: { w: number; h: number };
  crop?: Crop;
  radius?: number;
  border?: { color: string; width: number } | null;
  shadow?: boolean;
  opacity?: number;
  adjust?: Adjust | null;
  /** Sticker layers: which sticker, and its colour. */
  sticker?: string;
  /** Set on stickers the collage shuffle placed, so the next shuffle can replace them without touching yours. */
  auto?: boolean;
  /** Drawing layers: the line, as fractions of the layer's box. */
  stroke?: StrokeData;
  /** Text layers. */
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  /** Text effects. */
  outline?: { color: string; width: number } | null;
  textShadow?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
};

export type Design = {
  format: FormatKey;
  slideCount: number;
  background: string;
  gradient: Gradient | null;
  layers: Layer[];
  /** Numbers on the slides, drawn into the exported pictures. */
  pageNumbers?: PageNumbers | null;
};

export type PageNumbers = {
  style: "fraction" | "number" | "dots";
  position: "bottom-centre" | "bottom-right" | "top-right";
  color: string;
};

/** Black or white, whichever reads better on a #rrggbb background. */
export const readableOn = (hex: string) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#1d211e" : "#ffffff";
};

/** What a slide's number reads, counting from 1. */
export const pageLabel = (style: PageNumbers["style"], index: number, total: number) =>
  style === "fraction" ? `${index + 1}/${total}` : style === "number" ? String(index + 1) : Array.from({ length: Math.min(total, 12) }, (_, i) => (i === Math.min(index, 11) ? "●" : "○")).join(" ");

export type Project = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Set when the project is in the bin. */
  deletedAt: number | null;
  design: Design;
};

export const uid = () => crypto.randomUUID();

export const clampSlides = (n: number) =>
  Math.min(MAX_SLIDES, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

export const newDesign = (format: FormatKey, slideCount: number): Design => ({
  format,
  slideCount: clampSlides(slideCount),
  background: "#fbf9f4",
  gradient: null,
  layers: [],
});

// ---- slides ----------------------------------------------------------------
// A layer belongs to the slide under its middle. Every slide operation shifts
// layers sideways by whole slide widths.

export const slideOf = (l: Pick<Layer, "x" | "w">) =>
  Math.floor((l.x + l.w / 2) / SLIDE_WIDTH);

const shift = (l: Layer, slides: number): Layer =>
  slides === 0 ? l : { ...l, x: l.x + slides * SLIDE_WIDTH };

export const insertSlide = (layers: Layer[], at: number): Layer[] =>
  layers.map((l) => shift(l, slideOf(l) >= at ? 1 : 0));

export const removeSlide = (layers: Layer[], at: number): Layer[] =>
  layers
    .filter((l) => slideOf(l) !== at)
    .map((l) => shift(l, slideOf(l) > at ? -1 : 0));

export const duplicateSlide = (layers: Layer[], at: number): Layer[] => {
  const made = insertSlide(layers, at + 1);
  const copies = layers
    .filter((l) => slideOf(l) === at)
    .map((l) => ({ ...shift(l, 1), id: uid() }));
  return [...made, ...copies];
};

export const moveSlide = (
  layers: Layer[],
  slideCount: number,
  from: number,
  to: number,
): Layer[] => {
  if (from === to) return layers;
  const newIndex = (s: number) => {
    if (s === from) return to;
    if (from < to && s > from && s <= to) return s - 1;
    if (from > to && s >= to && s < from) return s + 1;
    return s;
  };
  return layers.map((l) => {
    const s = slideOf(l);
    return s < 0 || s >= slideCount ? l : shift(l, newIndex(s) - s);
  });
};

// ---- alignment -------------------------------------------------------------

export type Alignment = "left" | "centre" | "right" | "top" | "middle" | "bottom";
export const ALIGNMENTS: Alignment[] = ["left", "centre", "right", "top", "middle", "bottom"];

/** The box a layer fills, allowing for it turning about its top-left corner. */
export const boundsOf = (l: Pick<Layer, "x" | "y" | "w" | "h" | "rotation">) => {
  const a = (l.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const corners = [
    [0, 0],
    [l.w, 0],
    [0, l.h],
    [l.w, l.h],
  ].map(([cx, cy]) => ({ x: l.x + cx * cos - cy * sin, y: l.y + cx * sin + cy * cos }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns a layer by deg about its own middle, so it stays where it is. Layers turn about their top-left corner, so
 * the corner has to move to make up for it. The angle is kept between -180 and 180.
 */
export const rotatedBy = (l: Pick<Layer, "x" | "y" | "w" | "h" | "rotation">, deg: number) => {
  const at = (rot: number) => {
    const a = (rot * Math.PI) / 180;
    return { cos: Math.cos(a), sin: Math.sin(a) };
  };
  const before = at(l.rotation);
  const cx = l.x + (l.w / 2) * before.cos - (l.h / 2) * before.sin;
  const cy = l.y + (l.w / 2) * before.sin + (l.h / 2) * before.cos;
  let rotation = (((l.rotation + deg + 180) % 360) + 360) % 360 - 180;
  if (rotation === -180) rotation = 180;
  const after = at(rotation);
  return {
    rotation: round2(rotation),
    x: round2(cx - (l.w / 2) * after.cos + (l.h / 2) * after.sin),
    y: round2(cy - (l.w / 2) * after.sin - (l.h / 2) * after.cos),
  };
};

export const alignedPosition = (
  l: Pick<Layer, "x" | "y" | "w" | "h" | "rotation">,
  how: Alignment,
  slideCount: number,
  height: number,
) => {
  const slide = Math.min(slideCount - 1, Math.max(0, slideOf(l)));
  const box = boundsOf(l);
  const left = slide * SLIDE_WIDTH;
  let dx = 0;
  let dy = 0;
  if (how === "left") dx = left - box.l;
  if (how === "right") dx = left + SLIDE_WIDTH - box.r;
  if (how === "centre") dx = left + SLIDE_WIDTH / 2 - (box.l + box.r) / 2;
  if (how === "top") dy = -box.t;
  if (how === "bottom") dy = height - box.b;
  if (how === "middle") dy = height / 2 - (box.t + box.b) / 2;
  return { x: round2(l.x + dx), y: round2(l.y + dy) };
};

// ---- gradient --------------------------------------------------------------

/** Two ends of a gradient across w by h at an angle (0 left to right, 90 top to bottom). */
export const gradientLine = (angle: number, w: number, h: number) => {
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return {
    start: { x: cx - dx * half, y: cy - dy * half },
    end: { x: cx + dx * half, y: cy + dy * half },
  };
};

export const FONTS = [
  { label: "Inter Tight", value: "Inter Tight" },
  { label: "Fraunces", value: "Fraunces" },
  { label: "Georgia", value: "Georgia" },
  { label: "Courier", value: "Courier New" },
];

export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
