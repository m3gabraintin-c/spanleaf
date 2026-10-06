import { Design, FormatKey, Layer, SLIDE_WIDTH, FORMATS, newDesign, uid } from "./carouselModel";
import { measureText } from "./measureText";
import { THEMES, applyTheme, arrangePhotos } from "./themes";

/**
 * Starter layouts: empty photo frames already arranged across the slides in a theme, with a title to change.
 * Fill a frame by selecting it and adding a photo, or add several photos and they fill the frames in order.
 */

export type Template = {
  id: string;
  name: string;
  blurb: string;
  theme: string;
  /** Orientation of each frame, in order: l for landscape, p for portrait. */
  frames: string;
  title: string;
};

export const TEMPLATES: Template[] = [
  { id: "photo-dump", name: "Photo dump", blurb: "Five frames, paper and a little tilt", theme: "scrapbook", frames: "lpllp", title: "This week" },
  { id: "trip", name: "Trip diary", blurb: "Six Polaroid frames", theme: "polaroid", frames: "lplplp", title: "Summer trip" },
  { id: "soft", name: "Soft story", blurb: "Four rounded frames on a gradient", theme: "dreamy", frames: "plpl", title: "Little things" },
  { id: "journal", name: "Journal", blurb: "Four square-edged frames, serif title", theme: "editorial", frames: "llpl", title: "Field notes" },
  { id: "grid", name: "Clean grid", blurb: "Six tidy frames on white", theme: "clean", frames: "lllppp", title: "Highlights" },
  { id: "film", name: "Film roll", blurb: "Six frames on a dark ground", theme: "film", frames: "lplpll", title: "Roll 01" },
];

/** A frame: a photo layer with no picture yet. The size is the shape of a photo that would fill it. */
const frame = (i: number, kind: string): Layer => {
  const portrait = kind === "p";
  return {
    id: uid(),
    type: "image",
    name: `Frame ${i + 1}`,
    x: 0,
    y: 0,
    w: portrait ? 300 : 400,
    h: portrait ? 400 : 300,
    rotation: 0,
    locked: false,
    natural: portrait ? { w: 3000, h: 4000 } : { w: 4000, h: 3000 },
  };
};

/** The title's height comes from measuring text, which needs a real canvas, so tests can give their own. */
export const buildTemplate = (id: string, format: FormatKey, measure: typeof measureText = measureText): Design | null => {
  const t = TEMPLATES.find((x) => x.id === id);
  const theme = THEMES.find((x) => x.id === t?.theme);
  if (!t || !theme) return null;
  const blank = { ...newDesign(format, 1), layers: [...t.frames].map((k, i) => frame(i, k)) };
  const arranged = applyTheme(arrangePhotos(blank), theme.id);
  const title = { text: t.title, fontFamily: theme.fontFamily, fontSize: 84, w: SLIDE_WIDTH - 200, bold: false, letterSpacing: 0, lineHeight: 1 };
  const titleLayer: Layer = {
    id: uid(),
    type: "text",
    name: "Title",
    ...title,
    h: measure(title),
    color: theme.ink,
    align: "center",
    x: 100,
    y: Math.round(FORMATS[format].height * 0.02),
    rotation: 0,
    locked: false,
  };
  return { ...arranged, layers: [...arranged.layers, titleLayer] };
};
