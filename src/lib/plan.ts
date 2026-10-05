import { z } from "zod";
import { hex, text } from "./look";
import { THEME_IDS, ThemeChoiceSchema } from "./themes";

/** What the model may decide about a set of photos, and what is kept so the layout can be redone. */

const PhotoTagsSchema = z.object({
  subject: text(60),
  mood: text(40),
  /** The photo's main colours, most common first. */
  palette: z.array(hex).min(1).max(4),
  /** Where the eye goes, as fractions of the photo. A crop is centred here. */
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  /** The photo that should be shown biggest. At most one is honoured. */
  hero: z.boolean().optional(),
});

export const ComposePlanSchema = z.object({
  /** Which built-in theme suits these photos. Ignored when the person picked one. */
  theme: z.enum(THEME_IDS),
  /** Used by the themes that follow the photos' colours. The others keep their own. */
  background: hex,
  /** Preferred caption colour. Replaced by black or white if it can't be read on what it sits on. */
  ink: hex,
  title: text(40).optional(),
  captions: z.array(text(40).pipe(z.string().min(1))).max(6),
});

export type PhotoTags = z.infer<typeof PhotoTagsSchema>;
export type ComposePlan = z.infer<typeof ComposePlanSchema>;

export const ModelOutputSchema = z.object({ photos: z.array(PhotoTagsSchema), plan: ComposePlanSchema });
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

/** Used when the model is unavailable or returns something unusable. Plain, but still a finished carousel. */
export const FALLBACK_PLAN: ComposePlan = { theme: "scrapbook", background: "#f4f1ea", ink: "#2b2b2b", captions: [] };
export const FALLBACK_TAGS: PhotoTags = { subject: "", mood: "", palette: ["#888888"], focus: { x: 0.5, y: 0.5 } };

/** Five photos a slide on the 20 slides the biggest plan allows. */
const MAX_PHOTOS = 100;
const mediaId = z.string().min(1).max(64);

/** Saved in a document made from photos: enough to lay it out again in another theme without the model. */
export const ComposeMetaSchema = z.object({
  seed: z.number().int().min(0).max(1_000_000),
  theme: ThemeChoiceSchema,
  plan: ComposePlanSchema,
  tags: z.record(mediaId, PhotoTagsSchema).refine((t) => Object.keys(t).length <= MAX_PHOTOS, "Too many photos."),
  /** The photos in the order the person gave them. */
  order: z.array(mediaId).max(MAX_PHOTOS),
});
