import { z } from "zod";
import { FONTS } from "./fonts.generated";
import { hex, MaskSchema, OutlineSchema, PATTERN_KINDS, ShadowSchema, text } from "./look";
import { DOODLE_IDS, TAPE_IDS } from "./stickers";

/**
 * A theme is plain data: how photos are cut and tilted, what is stuck on them, how captions look, and what
 * colours to start from. The built-in ones are below, and a person can make their own by changing a built-in
 * (see customise). A theme is saved inside the project it was used for, so it travels with it.
 */

const FONT_IDS = new Set(FONTS.map((f) => f.id));
const PATTERN_CHOICES = [...PATTERN_KINDS, "none"] as const;

export const ThemeSchema = z.object({
  name: text(40).pipe(z.string().min(1)),
  description: text(140),
  /** How photos sit on a slide: overlapping like a collage, in a tidy grid, or tight edge to edge. */
  layout: z.enum(["loose", "tidy", "tight"]),
  /** About how many photos go on each slide. */
  perSlide: z.number().int().min(1).max(5),
  /** The most a photo is turned, in degrees either way. */
  tilt: z.number().min(0).max(12),
  /** Photos take these cuts in turn. */
  masks: z.array(MaskSchema.omit({ seed: true })).min(1).max(4),
  outline: OutlineSchema.nullable(),
  shadow: ShadowSchema.nullable(),
  /** How far the right-most photo on a slide runs over the edge into the next, as a fraction of a slide. */
  bridge: z.number().min(0).max(0.2),
  /** A paper label stuck under the caption, or the caption on the plain slide. */
  caption: z.enum(["label", "band"]),
  /** The most a caption is turned, in degrees either way. */
  captionTilt: z.number().min(0).max(6),
  align: z.enum(["left", "center", "right"]),
  font: z.string().refine((id) => FONT_IDS.has(id), "Unknown font."),
  labelTint: hex,
  palette: z.object({
    background: hex,
    ink: hex,
    pattern: z.enum(PATTERN_CHOICES),
    /** Whether the colours and font the model picked for the photos replace these. */
    adapt: z.boolean(),
  }),
  decor: z.object({
    tapes: z.number().int().min(0).max(2),
    doodles: z.number().int().min(0).max(3),
    tapeIds: z.array(z.enum(TAPE_IDS)).min(1).max(TAPE_IDS.length),
    doodleIds: z.array(z.enum(DOODLE_IDS)).min(1).max(DOODLE_IDS.length),
    tapeTints: z.array(hex).min(1).max(6),
    doodleTints: z.array(hex).min(1).max(6),
  }),
});

export type Theme = z.infer<typeof ThemeSchema>;

const SCRAPBOOK_MASKS: Theme["masks"] = [{ shape: "torn" }, { shape: "rect" }, { shape: "rounded", radius: 0.06 }, { shape: "torn" }];
const SOFT_SHADOW = { color: "#000000", blur: 24, x: 0, y: 10, opacity: 0.22 };
const WHITE_BORDER = { color: "#ffffff", width: 10 };
const DECOR_BASE = {
  tapeIds: TAPE_IDS,
  doodleIds: DOODLE_IDS,
  tapeTints: ["#f0c987", "#e58fa8", "#8fbfe0", "#a9d18e"],
  doodleTints: ["#ffffff", "#f6d94a"],
};

export const THEMES = {
  scrapbook: {
    name: "Scrapbook",
    description: "Overlapping photos with torn edges and white borders, tape, doodles and handwritten captions on paper labels. Casual and personal.",
    layout: "loose",
    perSlide: 3,
    tilt: 4,
    masks: SCRAPBOOK_MASKS,
    outline: WHITE_BORDER,
    shadow: SOFT_SHADOW,
    bridge: 0.08,
    caption: "label",
    captionTilt: 2.5,
    align: "center",
    font: "permanent-marker",
    labelTint: "#ecebe5",
    palette: { background: "#f4f1ea", ink: "#2b2b2b", pattern: "grid", adapt: true },
    decor: { ...DECOR_BASE, tapes: 2, doodles: 2 },
  },
  polaroid: {
    name: "Polaroid",
    description: "Thick white photo frames, slightly crooked, held down with tape on a warm paper background. Nostalgic.",
    layout: "loose",
    perSlide: 3,
    tilt: 6,
    masks: [{ shape: "rect" }],
    outline: { color: "#ffffff", width: 22 },
    shadow: { color: "#000000", blur: 20, x: 0, y: 12, opacity: 0.3 },
    bridge: 0.08,
    caption: "band",
    captionTilt: 2,
    align: "center",
    font: "caveat",
    labelTint: "#fffdf5",
    palette: { background: "#e8dcc8", ink: "#3b2f24", pattern: "none", adapt: false },
    decor: { ...DECOR_BASE, tapes: 2, doodles: 0, tapeIds: ["tape"] },
  },
  dreamy: {
    name: "Dreamy",
    description: "Soft pastel background with round and pill-shaped photos, sparkles and hearts, and a script caption. Light and romantic.",
    layout: "loose",
    perSlide: 3,
    tilt: 3,
    masks: [{ shape: "ellipse" }, { shape: "rounded", radius: 0.5 }, { shape: "rounded", radius: 0.18 }],
    outline: { color: "#ffffff", width: 8 },
    shadow: { color: "#7a3d5c", blur: 22, x: 0, y: 8, opacity: 0.2 },
    bridge: 0.08,
    caption: "label",
    captionTilt: 2,
    align: "center",
    font: "dancing-script",
    labelTint: "#fff4f8",
    palette: { background: "#fbeef3", ink: "#6b3a52", pattern: "dots", adapt: false },
    decor: { ...DECOR_BASE, tapes: 0, doodles: 3, doodleIds: ["sparkle", "heart", "dots", "drop"], doodleTints: ["#ffffff", "#f4a6b8"] },
  },
  editorial: {
    name: "Editorial",
    description: "Square photos in a tidy grid with a serif caption. Calm and magazine-like, good for travel and portraits.",
    layout: "tidy",
    perSlide: 3,
    tilt: 0,
    masks: [{ shape: "rect" }],
    outline: null,
    shadow: null,
    bridge: 0.08,
    caption: "band",
    captionTilt: 0,
    align: "center",
    font: "playfair-display",
    labelTint: "#ecebe5",
    palette: { background: "#faf8f4", ink: "#222222", pattern: "none", adapt: true },
    decor: { ...DECOR_BASE, tapes: 0, doodles: 0 },
  },
  clean: {
    name: "Clean",
    description: "Rounded photos in a tidy grid with soft shadows and a sans-serif caption. Bright and minimal, good for products.",
    layout: "tidy",
    perSlide: 3,
    tilt: 0,
    masks: [{ shape: "rounded", radius: 0.06 }],
    outline: null,
    shadow: { color: "#000000", blur: 18, x: 0, y: 6, opacity: 0.14 },
    bridge: 0.08,
    caption: "band",
    captionTilt: 0,
    align: "center",
    font: "dm-sans",
    labelTint: "#ecebe5",
    palette: { background: "#ffffff", ink: "#1a1a1a", pattern: "none", adapt: true },
    decor: { ...DECOR_BASE, tapes: 0, doodles: 0 },
  },
  film: {
    name: "Film",
    description: "Dark background with photos packed edge to edge in thin light frames and a condensed caption. Moody, like a contact sheet.",
    layout: "tight",
    perSlide: 4,
    tilt: 0,
    masks: [{ shape: "rect" }],
    outline: { color: "#f2f2f2", width: 4 },
    shadow: null,
    bridge: 0.06,
    caption: "band",
    captionTilt: 0,
    align: "left",
    font: "bebas-neue",
    labelTint: "#ecebe5",
    palette: { background: "#141414", ink: "#f2f2f2", pattern: "none", adapt: false },
    decor: { ...DECOR_BASE, tapes: 0, doodles: 0 },
  },
} satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as [ThemeId, ...ThemeId[]];

/** A built-in theme by id, or a custom one in full. */
export const ThemeChoiceSchema = z.union([z.enum(THEME_IDS), ThemeSchema]);
export type ThemeChoice = z.infer<typeof ThemeChoiceSchema>;

export const resolveTheme = (choice: ThemeChoice): Theme => (typeof choice === "string" ? THEMES[choice] : choice);

/** One line per built-in theme, for the instructions given to the model. */
export const describeThemes = () => THEME_IDS.map((id) => `- "${id}": ${THEMES[id].description}`).join("\n");

// ---- making your own -------------------------------------------------------------------------

export const EDGES = ["square", "rounded", "torn", "oval", "mixed"] as const;
export const DECORATIONS = ["none", "some", "lots"] as const;
export const CAPTIONS = ["label", "band"] as const;
type Edge = (typeof EDGES)[number];
type DecorationLevel = (typeof DECORATIONS)[number];

/** The few things a person changes, in terms they would use. */
export interface Customisation {
  background: string;
  pattern: (typeof PATTERN_CHOICES)[number];
  tilt: number;
  decorations: DecorationLevel;
  edges: Edge;
  border: boolean;
  caption: (typeof CAPTIONS)[number];
}

/** The colours and font a theme actually shows once the model's choices are taken into account. */
export interface Look {
  background: string;
  ink: string;
  pattern: (typeof PATTERN_CHOICES)[number];
  font: string;
}

const EDGE_MASKS: Record<Exclude<Edge, "mixed">, Theme["masks"][number]> = {
  square: { shape: "rect" },
  rounded: { shape: "rounded", radius: 0.06 },
  torn: { shape: "torn" },
  oval: { shape: "ellipse" },
};
const DECOR_COUNTS: Record<DecorationLevel, [number, number]> = { none: [0, 0], some: [1, 1], lots: [2, 3] };

/** What the controls should show for a theme. */
export function readCustomisation(theme: Theme, look: Look): Customisation {
  const only = theme.masks.length === 1 ? theme.masks[0].shape : null;
  const { tapes, doodles } = theme.decor;
  return {
    background: look.background,
    pattern: look.pattern,
    tilt: theme.tilt,
    decorations: tapes + doodles === 0 ? "none" : tapes >= 2 && doodles >= 2 ? "lots" : "some",
    edges: only === "rect" ? "square" : only === "rounded" ? "rounded" : only === "torn" ? "torn" : only === "ellipse" ? "oval" : "mixed",
    border: theme.outline !== null,
    caption: theme.caption,
  };
}

/**
 * A new theme from a base one with some controls changed. Only the controls in the patch change anything.
 * Changing a colour pins every colour and the font to what is showing now, so a later restyle can't swap
 * them for the model's picks.
 */
export function customise(base: Theme, patch: Partial<Customisation>, look: Look): Theme {
  const next: Theme = structuredClone(base);
  next.name = (base.name.endsWith(" (custom)") ? base.name : `${base.name.slice(0, 31)} (custom)`).slice(0, 40);

  if (patch.background !== undefined || patch.pattern !== undefined) {
    next.palette = { background: patch.background ?? look.background, ink: look.ink, pattern: patch.pattern ?? look.pattern, adapt: false };
    next.font = look.font;
  }
  if (patch.tilt !== undefined) next.tilt = patch.tilt;
  if (patch.caption !== undefined) next.caption = patch.caption;
  if (patch.decorations !== undefined) [next.decor.tapes, next.decor.doodles] = DECOR_COUNTS[patch.decorations];
  if (patch.edges !== undefined) next.masks = patch.edges === "mixed" ? structuredClone(SCRAPBOOK_MASKS) : [{ ...EDGE_MASKS[patch.edges] }];
  if (patch.border !== undefined) next.outline = patch.border ? (base.outline ?? { ...WHITE_BORDER }) : null;
  return ThemeSchema.parse(next);
}
